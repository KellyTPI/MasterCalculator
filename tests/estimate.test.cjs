const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Exercise the same self-contained script that runs when the estimator opens offline.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .find(([, source]) => source.includes('function calculateEstimate('))[1];
const app = vm.createContext({ window: { addEventListener() {} } });
vm.runInContext(script, app);
const [sample, caliwag] = app.buildSampleSavedJobs();
const cents = amount => Math.round(amount * 100);

function counterJob(length, width) {
  return {
    ...sample, counterPieces: [{ name: 'Test counter', length, width }], splashPieces: [],
    includeProtection: false, addonQuantities: {}
  };
}

test('cost-only custom work reduces profit and is itemized only internally', () => {
  for (const name of ['', 'Warranty work']) {
    const quote = app.calculateEstimate({ ...sample, customScopeCogs: 500, customScopeDesc: name });
    assert.equal(quote.estimatorTotalWithTax, 20141.46);
    assert.equal(quote.totalJobCogs, 9212.62);
    assert.equal(app.formatMargin(quote.trueNetMarginPct), '41.6%');
    assert.ok(quote.allCogsLines.some(line => line.cogs === 500 && line.name === (name || 'Custom scope')));
    assert.ok(!quote.activeAddonLines.some(line => line.cogs === 500));
  }
});

test('400 quarter-inch measurements reconcile the member and office schedules to cents', () => {
  for (let step = 1; step <= 400; step++) {
    const c = app.calculateEstimate(counterJob(step / 4, 25.5));
    assert.equal(cents(c.estimatorPreTaxSubtotal) + cents(c.estimatorGetTax), cents(c.estimatorTotalWithTax));
    assert.equal(cents(c.custPayCostco80) + cents(c.custPayTpi20), cents(c.estimatorTotalWithTax));
    assert.equal(c.custPayCostco80, c.totalPaidToCostco);
    assert.equal(c.custPayTpi20, c.totalBillActionFlow);
    assert.equal(cents(c.omsEntryPreTax) + cents(c.omsHawaiiGet), cents(c.totalPaidToCostco));
    assert.equal(cents(c.tpiInstallBasePreTax) + cents(c.tpiHawaiiGet), cents(c.totalBillActionFlow));
  }
  const c = app.calculateEstimate(counterJob(48.75, 25.5));
  assert.deepEqual([c.estimatorTotalWithTax, c.custPayCostco80, c.custPayTpi20], [1708.48, 1366.78, 341.70]);
});

test('the office override and direct change order stay separate from the field quote', () => {
  const c = app.calculateEstimate({ ...sample, manualTotalWithTax: 15000, extraDirectTpiPreTax: 1000 });
  assert.equal(c.estimatorTotalWithTax, 20141.46);
  assert.equal(c.finalQuoteWithTax, 15000);
  assert.equal(c.totalPaidToCostco, 12000);
  assert.equal(c.totalBillActionFlow, 4047.12);
  assert.equal(cents(c.tpiInstallBasePreTax) + cents(c.extraDirectPreTax) + cents(c.tpiHawaiiGet), 404712);
  assert.equal(cents(c.baseSubTotalPreTax + c.extraDirectPreTax - c.costcoMarginDed - c.shopCardDed - c.cardMailingFee),
    cents(c.totalBizNetRevenuePreTax));
});

test('job margins reflect the posted costs on either side of the 40% floor', () => {
  const c = app.calculateEstimate({ ...sample, extraDirectTpiCogs: 756 });
  assert.ok(c.trueNetMarginPct < 40);
  assert.equal(app.formatMargin(c.trueNetMarginPct), '39.96%');
  assert.equal(app.formatMargin(39.999), '<40.00%');
  // A direct-only job receives $101.87, pays the existing $1.87 fee and incurs $60 of costs.
  const atFloor = app.calculateEstimate({ ...counterJob(0, 0), extraDirectTpiPreTax: 101.87, extraDirectTpiCogs: 60 });
  assert.equal(atFloor.trueNetMarginPct, 40);
  assert.equal(app.formatMargin(atFloor.trueNetMarginPct), '40.00%');
});

test('slab capacity uses the stated dimensions and negative pieces block a quote', () => {
  assert.equal(app.calculateEstimate(counterJob(107, 60.25)).slabsNeeded, 1);
  assert.equal(app.calculateEstimate(counterJob(107.25, 60.25)).slabsNeeded, 2);
  assert.equal(app.calculateEstimate(counterJob(0, 0)).slabsNeeded, 0);
  assert.equal(app.calculateEstimate(counterJob(-12, 12)), null);
  assert.equal(app.calculateEstimate({ ...sample, splashPieces: [{ length: 12, height: -1 }] }), null);
});

test('built-in summaries follow their inputs and legacy sample repair preserves other jobs', () => {
  for (const job of [sample, caliwag]) {
    const c = app.calculateEstimate(job);
    assert.equal(job.summaryCache.finalTotalWithTax, c.finalQuoteWithTax);
    assert.equal(job.summaryCache.netMarginPct, c.trueNetMarginPct);
  }
  assert.equal(sample.summaryCache.finalTotalWithTax, 20141.46);
  assert.equal(app.formatMargin(caliwag.summaryCache.netMarginPct), '51.7%');
  const legacy = { ...sample, summaryCache: { billableSf: 90.67, finalTotalWithTax: 20141.35, netMarginPct: 44.8 } };
  assert.equal(app.refreshLegacySample(legacy).summaryCache.finalTotalWithTax, 20141.46);
  const realJob = { ...legacy, id: 'saved-member-job' };
  assert.equal(app.refreshLegacySample(realJob), realJob);
});
