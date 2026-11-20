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
  assert.equal(app.migrateSavedJob(legacy).summaryCache.finalTotalWithTax, 20141.46);
  const realJob = { ...legacy, id: 'saved-member-job' };
  assert.equal(app.migrateSavedJob(realJob), realJob);
});

function programJob(overrides = {}) {
  return {
    ...counterJob(48, 24), pricingVersion: '2026-11', selectedTierId: 'tier1',
    addonRateMode: 'live', ...overrides
  };
}

test('new rates, waterfall measurements and yield leave historical jobs at their original prices', () => {
  for (const [idx, rate] of [130, 150, 175, 205].entries()) {
    const job = programJob({
      selectedTierId: 'tier' + (idx + 1), addonQuantities: { waterfall: 1 },
      counterPieces: [{ name: 'Leg', length: 48, width: 24, qty: 2 }],
      splashPieces: [{ name: 'Splash', length: 36, height: 4, qty: 3 }],
      usableYieldPct: 50, shopLaborBase: 45
    });
    const c = app.calculateEstimate(job);
    assert.equal(c.billableStoneSf, 19);
    assert.equal(c.netStonePlusWfSf, 19);
    assert.equal(c.grossYieldSf, 38);
    assert.equal(c.customerStonePlusProtection, 19 * rate);
    assert.equal(c.shopLaborCogs, 19 * (idx === 3 ? 75 : 45));
    assert.equal(c.activeAddonLines[0].cogs, 900);
  }
  const original = app.calculateEstimate(sample);
  assert.equal(original.netStonePlusWfSf, original.billableStoneSf + 7);
  assert.equal(original.estimatorTotalWithTax, 20141.46);
  assert.equal(original.totalJobCogs, 8712.62);
  const empty = app.calculateEstimate(programJob({ counterPieces: [], includeProtection: true }));
  assert.equal(empty.estimatorTotalWithTax, 0);
  assert.equal(empty.totalJobCogs, 0);
  assert.equal(empty.shopGrossProfit, 0);
});

test('cutouts, custom unit costs, discounts, GET and card funding reconcile', () => {
  const job = programJob({
    addonQuantities: { cooktopCutout: 2, undermountSink: 1 }, discountMode: 'percent',
    discountValue: 10, discountReason: 'Member promotion', shopCardRate: 0.15,
    extraDirectTpiPreTax: 100,
    customLines: [{ description: 'Shelf', qty: 3, retail: 50, cogs: 20 },
      { description: '', qty: 2, retail: 0, cogs: 9 }]
  });
  const c = app.calculateEstimate(job);
  assert.equal(c.grossSubtotal, 1565);
  assert.equal(c.discountAmount, 156.50);
  assert.equal(c.estimatorPreTaxSubtotal, 1408.50);
  assert.equal(c.estimatorGetTax, 66.37);
  assert.equal(c.estimatorTotalWithTax, 1474.87);
  assert.equal(c.memberShopCardRebate, 211.28);
  assert.equal(c.totalJobCogs, 782.80); // 10 gross SF × 16.98, 8 SF × 45, 175 cutouts, 78 custom.
  assert.equal(cents(c.shopGrossProfit), cents(c.totalBizNetRevenuePreTax - c.totalJobCogs));
  assert.equal(c.activeAddonLines.length, 3);
  assert.equal(c.allCogsLines.length, 4);
  assert.equal(app.calculateEstimate(programJob({ addonQuantities: { cooktopCutout: 1 } })).activeAddonLines[0].retail, 0);
  const manual = app.calculateEstimate({ ...job, manualTotalWithTax: 1047.12 });
  assert.equal(manual.estimatorTotalWithTax, 1474.87);
  assert.equal(manual.shopGrossProfit, 85.33); // $1,100 revenue less $231.87 in Costco deductions and $782.80 in costs.
  assert.equal(manual.baseSubTotalPreTax, 1000);
  assert.equal(cents(manual.totalPaidToCostco + manual.totalBillActionFlow), 115183);
  for (const [mode, val] of [['percent', 110], ['fixed', 3000]]) {
    const discounted = app.calculateEstimate({ ...job, discountMode: mode, discountValue: val });
    assert.equal(discounted.estimatorTotalWithTax, 0);
    assert.equal(discounted.memberShopCardRebate, 0);
    assert.equal(discounted.shopGrossProfit, -682.80);
  }
});

test('invalid piece quantities, yield and custom costs block a quote', () => {
  for (const qty of [-1, 0.5, NaN]) {
    assert.equal(app.calculateEstimate(programJob({ counterPieces: [{ length: 48, width: 24, qty }] })), null);
  }
  assert.equal(app.calculateEstimate(programJob({ usableYieldPct: 0 })), null);
  assert.equal(app.calculateEstimate(programJob({ customLines: [{ description: '', qty: 1, retail: 0, cogs: -5 }] })), null);
});

test('single-estimate JSON import translates uploaded material, add-on and piece identifiers', () => {
  const incoming = {
    ...sample, version: 'tpi-costco-hawaii-v6', selectedColorId: 's-blanco-zeus', addonQtys: { plumb_reconnect_kitchen: 1 },
    counterPieces: [{ label: 'Island', lengthIn: 48, widthIn: 24, qty: 2 }], splashPieces: [],
    edgeProfile: 'E8-Ogee', afJobNumber: 'AF-12', quoteDate: '2026-11-18', customLines: [],
    discountMode: 'fixed', discountValue: 5, shopLaborBase: 45
  };
  const converted = app.readEstimateFile(incoming);
  const c = app.calculateEstimate(converted);
  assert.equal(c.color.name, 'Blanco Zeus');
  assert.equal(c.counterSf, 16);
  assert.equal(c.activeAddonLines[0].cogs, 1000);
  assert.equal(c.activeAddonLines[0].retail, 1400);
  assert.equal(c.discountAmount, 5);
  assert.equal(c.afJobNumber, 'AF-12');
  assert.equal(app.readEstimateFile({ version: 'tpi-estimate-1', job: converted }), converted);
  assert.throws(() => app.readEstimateFile({ ...incoming, selectedColorId: 'unknown' }));
  assert.throws(() => app.readEstimateFile({ ...incoming, addonQtys: { unknown: 2 } }));
});

test('old review records use current job margin and keep their saved prices', () => {
  const job = { ...caliwag, salesCommissionPct: 5, extraDirectTpiPreTax: 100 };
  const c = app.calculateEstimate(job);
  assert.equal(cents(c.shopGrossProfit), cents(c.totalBizNetRevenuePreTax - c.totalJobCogs));
  const historicalCache = { ...job.summaryCache, netMarginPct: 32.1 };
  const migrated = app.migrateSavedJob({ ...job, summaryCache: historicalCache });
  assert.ok(!Object.hasOwn(migrated, 'salesCommissionPct'));
  assert.equal(migrated.summaryCache.finalTotalWithTax, historicalCache.finalTotalWithTax);
  assert.equal(migrated.summaryCache.netMarginPct, c.trueNetMarginPct);
  assert.equal(app.migrateSavedJob(migrated), migrated);
  assert.equal(migrated.manualTotalWithTax, job.manualTotalWithTax);
});

test('office amounts and add-on quantities reject unfinished or negative entries', () => {
  for (const value of [-1, NaN, Infinity]) {
    for (const field of ['extraDirectTpiPreTax', 'extraDirectTpiCogs', 'manualTotalWithTax']) {
      const job = programJob({ [field]: value });
      assert.equal(app.calculateEstimate(job), null);
    }
    const addon = programJob({ addonQuantities: { miterEdge: value } });
    assert.equal(app.calculateEstimate(addon), null);
    assert.throws(() => app.validateEditableEstimate(addon));
  }
  const zero = app.calculateEstimate(programJob({ manualTotalWithTax: 0 }));
  assert.equal(zero.finalQuoteWithTax, 0);
  const valid = app.calculateEstimate(programJob({
    manualTotalWithTax: null, addonQuantities: { miterEdge: 2.75 }, extraDirectTpiPreTax: 12.34
  }));
  assert.equal(valid.activeAddonLines[0].qty, 2.75);
  assert.equal(valid.extraDirectPreTax, 12.34);
  assert.equal(valid.finalQuoteWithTax, valid.estimatorTotalWithTax);
});

test('previously saved negative direct costs can reopen as a draft for correction', () => {
  const job = programJob({ extraDirectTpiCogs: -12.50 });
  const draft = app.readEstimateFile({ version: 'tpi-estimate-1', job });
  assert.equal(draft.extraDirectTpiCogs, -12.50);
  assert.equal(app.calculateEstimate(draft), null);
  assert.ok(app.calculateEstimate({ ...draft, extraDirectTpiCogs: 12.50 }));
});

test('amounts and measurements that overflow a payable total block the quote', () => {
  assert.equal(app.calculateEstimate(programJob({ extraDirectTpiPreTax: 1e308 })), null);
  assert.equal(app.calculateEstimate(counterJob(1e200, 1e200)), null);
  assert.equal(app.calculateEstimate(programJob({ addonQuantities: { miterEdge: 1e300 } })), null);
});

test('slab counts respect exact capacity and still round a genuine excess up', () => {
  const piece = { length: 327 / 2.54, width: (159 / 2.54) * 0.60, qty: 5 };
  const withPiece = p => app.calculateEstimate(programJob({ counterPieces: [p], usableYieldPct: 60 }));
  assert.equal(withPiece(piece).slabsNeeded, 5);
  assert.equal(withPiece({ ...piece, width: piece.width + 0.000001 }).slabsNeeded, 6);
  assert.equal(withPiece({ ...piece, width: 0.000001 }).slabsNeeded, 1);
});

test('transfer files reject unsupported rebates and unrecognized billable add-ons', () => {
  for (const edit of [{ shopCardRate: 10 }, { shopCardRate: -0.1 }, { addonQuantities: { futureService: 1 } }]) {
    const job = programJob(edit);
    assert.throws(() => app.readEstimateFile({ version: 'tpi-estimate-1', job }));
    assert.equal(app.calculateEstimate(job), null);
  }
  const old = counterJob(-12, 12);
  assert.equal(app.readEstimateFile({ version: 'tpi-estimate-1', job: old }), old);
  assert.equal(app.calculateEstimate(old), null);
  assert.deepEqual(app.migrateSavedJob({ ...sample, summaryCache: undefined }).summaryCache, sample.summaryCache);
});

test('miter upgrades require a measured length and Dekton includes its edge', () => {
  for (const version of ['original', '2026-11']) {
    for (const tier of ['tier1', 'tier2', 'tier3', 'tier4']) {
      const job = programJob({ pricingVersion: version, selectedTierId: tier, edgeProfile: 'Miter' });
      const priced = app.calculateEstimate({ ...job, addonQuantities: { miterEdge: 2.5 } });
      if (tier === 'tier4') {
        assert.equal(priced.grossSubtotal, app.calculateEstimate(job).grossSubtotal);
        assert.equal(priced.activeAddonLines.length, 0);
      } else {
        assert.equal(app.calculateEstimate(job), null);
        assert.equal(priced.activeAddonLines[0].retail, 75);
        assert.ok(app.calculateEstimate({ ...job, edgeProfile: 'E1-Eased' }));
      }
    }
  }
});

test('historical fractional counts open for correction while SF and LF retain precision', () => {
  for (const id of ['undermountSink', 'cooktopCutout', 'plumbDisc', 'waterfall', 'showerPan']) {
    const old = programJob({ addonQuantities: { [id]: 1.5 } });
    assert.equal(app.readEstimateFile({ version: 'tpi-estimate-1', job: old }), old);
    assert.equal(app.calculateEstimate(old), null);
    assert.ok(app.calculateEstimate({ ...old, addonQuantities: { [id]: 1 } }));
  }
  const measured = app.calculateEstimate(programJob({ addonQuantities: { demoStone: 0.25, miterEdge: 1.5 } }));
  assert.deepEqual(Array.from(measured.activeAddonLines, l => l.retail), [45, 5.25]);
});

test('the saved viewer uses the applied discount for new and historical summaries', () => {
  for (const [mode, value, text] of [
    ['percent', 110, 'Promotion (100%): −$1,040.00'],
    ['fixed', 1500, 'Promotion: −$1,040.00'],
    ['percent', 10, 'Promotion (10%): −$104.00']
  ]) {
    const job = programJob({ discountMode: mode, discountValue: value, discountReason: 'Promotion', summaryCache: {} });
    const calc = app.calculateEstimate(job);
    assert.equal(app.savedDiscountText(job), text);
    assert.equal(app.summarizeEstimate(calc).discountText, text);
  }
});
