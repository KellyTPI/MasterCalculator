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
    const before = JSON.stringify(await accessSavedJobs());
    const calls = [];
    window.print = () => calls.push('print');
    window.copyTextFallback = () => calls.push('copy');
    window.downloadFile = () => calls.push('download');
    await saveCurrentJob();
    printEstimate(true);
    copyQuoteToClipboard();
    copySplitToClipboard();
    saveEstimateJson();
    await saveEditableEstimatePdf();
    if (before !== JSON.stringify(await accessSavedJobs())) calls.push('save');
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

async function exerciseBillingBoundaries(page) {
  await page.evaluate(() => startNewEstimate(false));
  const length = page.getByRole('spinbutton', { name: 'Counter 1 length in inches', exact: true });
  const width = page.getByRole('spinbutton', { name: 'Counter 1 width in inches', exact: true });
  await page.getByRole('button', { name: '+ Counter Run', exact: true }).click();
  const demoQty = page.locator('#addonQty_demoStone');
  const sync = page.locator('[data-addon-row]').filter({ has: demoQty }).getByText('Sync to Counter SF');
  await length.fill('35.2');
  await width.fill('45');
  await sync.click();
  assert.equal(await demoQty.inputValue(), '11');
  assert.equal(await page.evaluate(() => latestCalc.activeAddonLines.find(l => l.name === 'Demo Stone').retail), 231);
  await length.fill('35.200001');
  await sync.click();
  assert.equal(await demoQty.inputValue(), '12');

  // Standalone November files can omit the base labor selection.
  const job = await page.evaluate(() => captureCurrentJobSnapshot());
  delete job.shopLaborBase;
  const upload = (name, data) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  for (const [version, base] of [['2026-11', 45], ['original', 50]]) {
    const estimate = { ...job, pricingVersion: version, selectedTierId: 'tier4', projectName: version };
    await page.locator('#estimateJsonInput').setInputFiles(upload('estimate.json', { version: 'tpi-estimate-1', job: estimate }));
    await page.waitForFunction(name => document.getElementById('projectName').value === name, version);
    assert.equal(await page.locator('#shopLaborBase').inputValue(), String(base));
    assert.equal(await page.evaluate(() => latestCalc.laborRate), base + 30);
  }
  await length.fill('22.4');
  await width.fill('22.5');
  await sync.click();
  assert.equal(await demoQty.inputValue(), '4');
}

async function exerciseQuoteValidation(page) {
  await page.evaluate(() => { startNewEstimate(false); setViewMode('customer'); });
  await page.locator('#chkProtectionPlan').uncheck();
  const addCounter = page.getByRole('button', { name: '+ Counter Run', exact: true });
  await addCounter.click();
  await addCounter.click();
  const total = page.locator('#custFinalTotalWithTax');
  assert.equal(await total.textContent(), '$4,628.27');
  const field = name => page.getByRole('spinbutton', { name, exact: true });
  const width = field('Counter 2 width in inches');
  await width.fill('');
  assert.equal(await page.evaluate(() => latestCalc), null);
  assert.equal(await total.textContent(), '$4,628.27');
  await page.evaluate(() => saveCurrentJob());
  assert.ok(await width.evaluate(el => el === document.activeElement));
  assert.equal(await page.evaluate(() => state.currentJobId), null);
  // Adding and removing another row rebuilds the inputs.
  await addCounter.click();
  await page.getByRole('button', { name: 'Remove section' }).last().click();
  assert.equal(await width.inputValue(), '');
  await width.fill('0');
  assert.equal(await total.textContent(), '$2,314.14');
  await width.fill('25.5');
  assert.equal(await total.textContent(), '$4,628.27');
  await page.getByRole('button', { name: '+ 4" Splash', exact: true }).click();
  const splashQty = field('Backsplash 1 quantity');
  await splashQty.fill('');
  assert.equal(await page.evaluate(() => latestCalc), null);
  await page.getByRole('button', { name: 'Remove splash' }).click();
  assert.equal(await total.textContent(), '$4,628.27');

  await page.locator('#edgeProfileSelect').selectOption('Miter');
  assert.equal(await page.evaluate(() => latestCalc), null);
  assert.match(await page.locator('#measurementWarning').innerText(), /linear feet/);
  await page.locator('#fixEstimateInput').click();
  const miter = page.locator('#addonQty_miterEdge');
  assert.ok(await miter.evaluate(el => el === document.activeElement));
  await miter.fill('10.5');
  assert.equal(await page.evaluate(() => latestCalc.estimatorPreTaxSubtotal), 4735);
  await miter.fill('');
  assert.equal(await page.evaluate(() => latestCalc), null);
  await page.evaluate(() => selectTier('tier4'));
  assert.ok(await miter.isDisabled());
  assert.ok(await page.evaluate(() => Boolean(latestCalc)));

  const sink = page.locator('#addonQty_undermountSink');
  await sink.fill('0.5');
  assert.equal(await page.evaluate(() => latestCalc), null);
  await sink.locator('..').getByRole('button', { name: '+', exact: true }).click();
  assert.equal(await sink.inputValue(), '1');
  assert.equal(await page.evaluate(() => latestCalc.activeAddonLines.find(l => l.name === 'Undermount Sink Cutout').retail), 250);

  const archived = await page.evaluate(() => captureCurrentJobSnapshot());
  archived.addonQuantities.undermountSink = 0.5;
  await page.locator('#estimateJsonInput').setInputFiles({ name: 'fractional.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 'tpi-estimate-1', job: archived })) });
  await page.waitForFunction(() => state.addonQuantities.undermountSink === 0.5);
  assert.equal(await page.evaluate(() => latestCalc), null);
  await sink.fill('1');

  for (const [mode, value] of [['percent', '110'], ['fixed', '50000']]) {
    await page.locator('#discountMode').selectOption(mode);
    await page.locator('#discountValue').fill(value);
    const quoted = await page.locator('#customerDiscount').innerText();
    assert.ok(quoted.includes('−$7,220.00'));
    if (mode === 'percent') assert.ok(quoted.includes('(100%)'));
    await page.evaluate(() => saveCurrentJob());
    await page.evaluate(() => openSavedEstimateViewer(savedJobs.find(j => j.id === state.currentJobId)));
    assert.equal(await page.locator('#savedEstimateViewerDetails dt').filter({ hasText: /^Discount$/ }).locator('..').locator('dd').innerText(), quoted);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  }
}

async function exerciseSavedJobs(page) {
  const jobs = await page.evaluate(() => buildSampleSavedJobs());
  const stored = () => page.evaluate(() => accessSavedJobs());
  const restore = async data => {
    await page.locator('#toastText').evaluate(el => { el.textContent = ''; });
    await page.locator('#importJsonInput').setInputFiles({
      name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data))
    });
    await page.waitForFunction(() => document.getElementById('toastText').textContent.length > 0);
    return page.locator('#toastText').textContent();
  };

  await page.evaluate(async () => {
    for (const job of [...savedJobs]) await deleteSavedJob(job.id);
  });
  await page.reload();
  assert.deepEqual(await stored(), []);

  const renamed = { ...jobs[0], projectName: 'Restored kitchen' };
  assert.match(await restore({ jobs: [renamed, { id: jobs[1].id }] }), /Backup job 2/i);
  assert.deepEqual(await stored(), []);
  assert.match(await restore({ jobs }), /Imported 2/);
  assert.match(await restore([renamed]), /Imported 1/);
  assert.deepEqual((await stored()).map(j => j.projectName), [renamed.projectName, jobs[1].projectName]);

  // Two tabs saving distinct drafts at the same time must retain both jobs.
  const otherTab = await page.context().newPage();
  try {
    await otherTab.goto(url);
    for (let trial = 0; trial < 6; trial++) {
      const names = ['Kitchen ' + trial, 'Bath ' + trial];
      await Promise.all([page, otherTab].map((tab, i) => tab.evaluate(name => {
        startNewEstimate(false);
        document.getElementById('projectName').value = name;
      }, names[i])));
      const start = Date.now() + 100;
      await Promise.all([page, otherTab].map(tab => tab.evaluate(async time => {
        await new Promise(resolve => setTimeout(resolve, Math.max(0, time - Date.now())));
        await saveCurrentJob();
      }, start)));
      const records = await stored();
      for (const name of names) assert.equal(records.filter(job => job.projectName === name).length, 1);
      assert.equal(records.length, jobs.length + 2 * (trial + 1));
    }
    const beforeRepeat = (await stored()).length;
    await page.evaluate(async () => {
      startNewEstimate(false);
      await Promise.all([saveCurrentJob(), saveCurrentJob()]);
    });
    assert.equal((await stored()).length, beforeRepeat + 1);
    await page.evaluate(async () => {
      startNewEstimate(false);
      const pending = saveCurrentJob();
      startNewEstimate(false);
      await pending;
    });
    assert.equal(await page.evaluate(() => state.currentJobId), null);
  } finally {
    await otherTab.close();
  }

  // A failed write must leave the draft available and the saved list intact.
  await page.evaluate(() => startNewEstimate(false));
  const beforeFailure = await stored();
  // The downloaded backup must include the latest writes from both tabs.
  const [backup] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => exportSavedJobsJson())
  ]);
  const parts = [];
  for await (const part of await backup.createReadStream()) parts.push(part);
  assert.deepEqual(JSON.parse(Buffer.concat(parts).toString('utf8')).jobs, beforeFailure);

  await page.evaluate(async () => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const result = put.apply(this, args);
      this.transaction.abort();
      return result;
    };
    await saveCurrentJob();
  });
  assert.match(await page.locator('#toastText').innerText(), /Could not update saved jobs/);
  assert.equal(await page.evaluate(() => state.currentJobId), null);
  assert.deepEqual(await stored(), beforeFailure);
  await page.reload();
  assert.deepEqual(await stored(), beforeFailure);
}

async function exerciseLegacyStorage(browser, jobs) {
  for (const legacy of [JSON.stringify(jobs), '[]', 'unreadable']) {
    const context = await browser.newContext();
    try {
      await context.addInitScript(value => localStorage.setItem('tpi_costco_hawaii_saved_jobs_v1', value), legacy);
      const page = await context.newPage();
      await page.goto(url);
      await page.evaluate(() => saveCurrentJob());
      if (legacy === 'unreadable') {
        assert.equal(await page.evaluate(() => state.currentJobId), null);
        assert.match(await page.locator('#toastText').textContent(), /Could not update saved jobs/);
      } else {
        await page.reload();
        const records = await page.evaluate(() => accessSavedJobs());
        assert.equal(records.length, JSON.parse(legacy).length + 1);
        assert.deepEqual(records.slice(1), JSON.parse(legacy));
      }
      assert.equal(await page.evaluate(() => localStorage.getItem(STORAGE_KEY)), legacy);
    } finally {
      await context.close();
    }
  }
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
      await exerciseBillingBoundaries(page);
      await exerciseQuoteValidation(page);
      await exerciseSavedJobs(page);
      if (width === 1366) await exerciseLegacyStorage(browser, await page.evaluate(() => buildSampleSavedJobs()));
      assert.deepEqual(errors, []);
      await context.close();
      console.log('Passed estimate editing, billing boundaries and saved-job recovery at ' + width + 'px');
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
