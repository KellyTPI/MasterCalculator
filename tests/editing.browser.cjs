const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const url = process.argv[2] || pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

async function exerciseEditor(page) {
  await page.goto(url);
  await page.evaluate(() => loadJobById('job_sample_80sf'));
  const field = id => page.locator('#' + id);
  const tab = name => field('btn' + name + 'View').click();
  const focused = locator => locator.evaluate(input => input === document.activeElement);
  const canCalculate = () => page.evaluate(() => Boolean(latestCalc));
  const genericWarning = field('measurementWarning');

  const selectedColor = field('colorSelect');
  const search = field('colorSearchInput');
  const originalColor = await selectedColor.inputValue();
  const originalPrice = await field('custFinalTotalWithTax').innerText();
  for (const term of ['Miami', 'no-such-color']) {
    await search.fill(term);
    assert.equal(await selectedColor.inputValue(), originalColor);
    assert.equal(await field('custFinalTotalWithTax').innerText(), originalPrice);
    assert.equal(await field('colorSearchHint').isVisible(), term === 'no-such-color');
  }
  await field('clearSearchBtn').click();
  assert.equal(await selectedColor.inputValue(), originalColor);
  await search.fill('Miami');
  await selectedColor.selectOption('tier1:0');
  assert.notEqual(await field('custFinalTotalWithTax').innerText(), originalPrice);
  await page.evaluate(() => loadJobById('job_sample_80sf'));

  // Replacing 80 one key at a time must leave focus in the editor after the first digit.
  await tab('Manager');
  const yieldInput = field('usableYieldPct');
  const previousArea = await field('mgrGrossYieldSf').innerText();
  await yieldInput.fill('');
  await page.keyboard.type('7');
  assert.ok(await focused(yieldInput));
  assert.ok(await field('managerPanel').isVisible());
  assert.equal(await field('mgrGrossYieldSf').innerText(), previousArea);
  assert.equal(await canCalculate(), false);
  await page.keyboard.type('5.5');
  assert.equal(await yieldInput.inputValue(), '75.5');
  assert.notEqual(await field('mgrGrossYieldSf').innerText(), previousArea);

  // An error on a different tab must have a reachable correction path.
  await yieldInput.fill('101');
  await tab('Customer');
  await field('fixEstimateInput').click();
  assert.ok(await focused(yieldInput));
  await yieldInput.fill('80');

  // Valid historical dimensions (the sample contains 173.65 inches) and decimal dollars
  // must never take focus away from the field that actually blocks the estimate.
  await tab('Split');
  const override = field('manualTotalOverrideInput');
  const charge = field('extraDirectTpiPreTax');
  const cost = field('extraDirectTpiCogs');
  await charge.fill('12.34');
  await cost.fill('1.75');
  await override.fill('-1');
  assert.ok(await focused(override));
  assert.ok(await field('splitPanel').isVisible());
  assert.equal(await canCalculate(), false);
  await tab('Customer');
  await page.evaluate(() => openSavedJobsModal());
  await page.getByRole('button', { name: 'Save Current Estimate (.json)' }).click();
  assert.ok(await focused(override));
  assert.equal(await field('savedJobsModal').isVisible(), false);
  await override.fill('0');
  assert.equal(await page.evaluate(() => latestCalc.finalQuoteWithTax), 0);
  await override.fill('');
  await override.press('Tab');
  assert.equal(await page.evaluate(() => state.manualTotalWithTax), null);
  assert.equal(await override.inputValue(), await page.evaluate(() => latestCalc.estimatorTotalWithTax.toFixed(2)));

  for (const input of [charge, cost, override]) {
    await input.fill('');
    await page.keyboard.type('-');
    assert.equal(await canCalculate(), false);
    assert.ok(await focused(input));
    await page.keyboard.type('2');
    assert.equal(await canCalculate(), false);
    await input.fill('12.34');
    assert.equal(await canCalculate(), true);
  }

  // The first click after typing a quantity must apply to the newly entered value.
  const addon = field('addonQty_demoStone');
  await addon.fill('3.25');
  assert.equal(await page.evaluate(() => latestCalc.activeAddonLines.find(l => l.name === 'Demo Stone').qty), 3.25);
  await addon.locator('..').getByRole('button', { name: '+', exact: true }).click();
  assert.equal(await addon.inputValue(), '4.25');
  await addon.fill('-1');
  assert.equal(await canCalculate(), false);
  await addon.fill('3.25');

  const length = page.getByRole('spinbutton', { name: 'Counter 1 length in inches', exact: true });
  const splashQty = page.getByRole('spinbutton', { name: 'Backsplash 1 quantity', exact: true });
  for (const [input, invalidValue, validValue] of [[length, '-1', '13.125'], [splashQty, '1.5', '2']]) {
    await input.fill(invalidValue);
    assert.ok(await genericWarning.isVisible());
    assert.ok(await field('splitPanel').isVisible());
    await field('fixEstimateInput').click();
    assert.ok(await focused(input));
    await input.fill(validValue);
    assert.ok(await canCalculate());
  }

  await field('discountMode').selectOption('percent');
  await field('discountValue').fill('-2');
  assert.equal(await canCalculate(), false);
  await field('discountMode').selectOption('none');
  assert.ok(await canCalculate());

  // A partly typed internal cost must survive a row rebuild and a trip to the member view.
  await page.getByRole('button', { name: '+ Custom line' }).click();
  const customCost = page.getByRole('spinbutton', { name: /Unit internal cost/ }).last();
  await customCost.fill('');
  await page.keyboard.type('-');
  await tab('Customer');
  assert.equal(await customCost.count(), 0);
  assert.equal(await canCalculate(), false);
  assert.match(await genericWarning.innerText(), /internal cost/i);
  await field('fixEstimateInput').click();
  assert.ok(await focused(customCost));
  await customCost.fill('8.50');
  assert.ok(await canCalculate());

  // All issue actions must refuse the same draft. Native browser printing must hide stale totals.
  await yieldInput.fill('39');
  const output = await page.evaluate(async () => {
    const before = localStorage.getItem(STORAGE_KEY);
    const calls = [];
    window.print = () => calls.push('print');
    window.copyTextFallback = () => calls.push('copy');
    window.downloadFile = () => calls.push('download');
    saveCurrentJob();
    printEstimate(true);
    copyQuoteToClipboard();
    copySplitToClipboard();
    saveEstimateJson();
    await saveEditableEstimatePdf();
    if (before !== localStorage.getItem(STORAGE_KEY)) calls.push('save');
    return calls;
  });
  assert.deepEqual(output, []);
  await page.emulateMedia({ media: 'print' });
  for (const panel of ['customerPanel', 'splitPanel', 'managerPanel']) {
    assert.equal(await field(panel).isVisible(), false);
  }
  assert.ok(await genericWarning.isVisible());
  await page.emulateMedia({ media: 'screen' });
  await yieldInput.fill('75.5');
  await page.evaluate(() => saveCurrentJob());
  await page.reload();
  await page.evaluate(() => loadJobById('job_sample_80sf'));
  await tab('Manager');
  assert.equal(await yieldInput.inputValue(), '75.5');
  assert.equal(await page.evaluate(() => state.addonQuantities.demoStone), 3.25);
  assert.equal(await page.evaluate(() => state.manualTotalWithTax), 12.34);
  assert.equal(await page.getByRole('spinbutton', { name: /Unit internal cost/ }).last().inputValue(), '8.5');
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const width of [1366, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await exerciseEditor(page);
      assert.deepEqual(errors, []);
      await context.close();
      console.log('Passed estimate editing and recovery at ' + width + 'px');
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
