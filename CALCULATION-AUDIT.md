# TPI Costco Master Estimator calculation audit

## Local fix verification

The local estimator now includes cost-only custom work in job costs, reconciles the member and office payment schedules to cents, applies the 40% floor to the unrounded job margin, and uses the full slab dimensions to calculate capacity. The mobile summary follows the selected view, direct charges appear separately, and the built-in examples calculate their summaries from their inputs. Invalid dimensions block issuing a quote until corrected.

All 400 quarter-inch measurement cases reconciled after the fixes. Independent decimal calculations matched 22 results in each of 312 catalog and settlement scenarios. Browser checks covered saved jobs, both clipboard summaries, editable PDF download and reopening, and print output with an invalid measurement. Run the [regression tests](tests/estimate.test.cjs) locally with `node --test tests/estimate.test.cjs`.

## Original findings on GitHub revision 83b4a5d

**November 17, 2026.** The estimator calculates an ordinary quote consistently using its configured rates. Several reproducible cases give the wrong job cost, payment schedule, margin status, or slab count. The review covered the local calculator and the matching [GitHub revision 83b4a5d](https://github.com/KellyTPI/MasterCalculator/tree/83b4a5d0ca76524eab83b7c19a4b46ab39578903).

## Confirmed discrepancies

| Where | How to reproduce | Result |
| --- | --- | --- |
| Custom scope and COGS Audit | Load the 80 SF Kitchen + Waterfall sample. Enter $500 in Internal Sub / COGS Cost. Leave the description empty and retail at $0. | Total job costs stay at $8,712.62. They should rise to $9,212.62. Profit is $500 too high and the displayed margin is 44.8% instead of 41.6%. Adding a description fixes the total, but the $500 still has no line in the itemized COGS list. |
| Member payment schedule | Use Tier 2, one 48.75 × 25.5 inch counter, no backsplash, add-ons, or protection. | The quote is $1,708.48. The two amounts due are $1,366.79 and $341.70, which add to $1,708.49. Each amount is independently rounded from the unrounded quote. The same problem can affect subtotal plus tax. |
| Manager and office floor badges | On the original 80 SF sample, add $756 of Extra Direct TPI Sub/COGS Cost. | The underlying margin is 39.96148%. Both views say “Above 40% Floor.” The pass condition in the program starts at 39.95%. |
| Slab count | Use one 107 × 60.25 inch counter without a waterfall. | The app shows “2 Slabs” and “1.00 exact (56 SF rem).” At 80% yield it needs 55.96137 gross SF. The stated 327 × 159 cm slab contains 55.96480 SF. One slab suffices under the app’s area rule. The calculator rounds the slab capacity to 55.96 before calculating the count. |
| Saved Jobs examples | Open Saved Jobs on first use, record the displayed values, then load each example. | The 80 SF sample lists $20,141.35 and recalculates to $20,141.46. Caliwag lists a 45.1% margin and recalculates to 51.7% with its saved $29,002.34 office override. Both starting summaries are hard-coded. |
| Customer-facing mobile total | Apply the $15,000 office test preset to the 80 SF sample and switch back to Field Quote. | The mobile bar says $15,000 with a $12,000 / $3,000 split. The customer quote still says $20,141.46 with a $16,113.17 / $4,028.29 split. The mobile bar takes its amounts from the office view. |
| Direct change orders | Add $1,000 Extra Direct TPI Pre-Tax to the original 80 SF sample. | The office correctly adds $1,047.12 to ActionFlow. On the customer mobile bar the “20%” now includes this extra charge while “Total” excludes it. The manager summary also adds the $1,000 to net revenue without showing it in the subtotal or on a separate revenue line. |
| Negative measurements | With Tier 2, no protection or add-ons, enter a 12 × −12 inch countertop. | The app accepts the dimensions for calculation, quotes −$197.91, and reports −$82.48 of job costs. The minimum shown on the input does not prevent recalculation. |

The [quote and costs](https://github.com/KellyTPI/MasterCalculator/blob/83b4a5d0ca76524eab83b7c19a4b46ab39578903/index.html#L2340-L2498), [margin badges and mobile summary](https://github.com/KellyTPI/MasterCalculator/blob/83b4a5d0ca76524eab83b7c19a4b46ab39578903/index.html#L2523-L2588), and [built-in saved examples](https://github.com/KellyTPI/MasterCalculator/blob/83b4a5d0ca76524eab83b7c19a4b46ab39578903/index.html#L1159-L1243) contain the relevant code.

## What checked out

I ran the actual calculator in an isolated Chrome profile and recalculated its results separately using Python decimal arithmetic. The 312 scenarios covered all 39 colors across four tiers, all 14 add-on types, both retail rate modes, both Shop Card percentages and funding bases, protection on and off, custom work, direct charges, and office total overrides. All 8,736 comparisons of unrounded results matched the formulas under the configured assumptions. Separate checks matched the displayed material, labor, protection cost, and slab count to those configured rules in each scenario. The slab boundary above tests the configured rule against the stated physical dimensions.

For the built-in **80 SF Kitchen + Waterfall** sample, preserving the full precision of the entered measurements gives the following figures.

| Measure | Recalculated result |
| --- | ---: |
| Billable counters and backsplash | 90.6671875 SF |
| Pre-tax quote | $19,235.10 |
| Hawaii GET pass-on | $906.36 |
| Customer total | $20,141.46 |
| Due at Costco / due to TPI | $16,113.17 / $4,028.29 |
| Member Shop Card at the configured 10% | $1,923.51 |
| Business revenue after Costco deductions, before tax | $15,770.91 |
| Job costs | $8,712.62 |
| Job profit / margin | $7,058.29 / 44.8% |

A separate rounding test used 400 valid quarter-inch lengths from 0.25 to 100 inches at a fixed 25.5-inch width. Payments failed to sum to the displayed total in 80 cases. The displayed subtotal plus tax failed to sum in 95 cases. In 148 cases at least one reconciliation failed. These counts describe that test set only.

The editable PDF round-trip preserved the Caliwag inputs and its office override. Its Field Quote and customer copy used $25,840.83, while the office copy and saved summary used $29,002.34. Those are the two amounts the app is designed to track. A saved total alone does not identify which one a customer saw.

## Business assumptions to confirm

- **Hawaii GET.** The configured 4.712% matches the state's published maximum customer pass-on for the applicable retail rate in all four counties for 2026. [Hawaii Department of Taxation](https://tax.hawaii.gov/geninfo/countysurcharge/)
- **Shop Card eligibility.** The estimator applies the member rebate to the entire Field Quote subtotal, including demolition, protection, and custom work. Costco describes a rebate on qualifying pre-tax installed purchases and lists possible exceptions for preparation work and additional products. The estimator has no field to exclude ineligible scope. For each $1,000 of excluded work, the displayed rebate would be $100 too high at 10%, or $150 at 15%. The full-base/OMS switch changes only the office funding deduction. TPI’s job-specific eligibility and any active promotional rate require dealer terms. [Costco’s Cosentino program](https://www.costco.com/f/-/cosentino-custom-countertops)
- **Retail rates and settlement terms.** The repository embeds the price tables. TPI’s source rate sheet and a settlement statement were unavailable. The dollar rates, 80/20 agreement, 10% OMS deduction, $1.87 fee, and protection reserve were checked as inputs to the arithmetic. Their commercial accuracy is unverified. A zero-dollar job also incurs the fixed fee and shows −$1.87 profit. [Configured rates](https://github.com/KellyTPI/MasterCalculator/blob/83b4a5d0ca76524eab83b7c19a4b46ab39578903/index.html#L981-L1102)
- **Slab purchasing and margin.** The estimator charges cost to a job for the area consumed at the assumed 80% yield. The 80 SF sample allocates $3,171.74 of stone. Buying its three whole slabs at the configured rate would cost $4,361.52, a $1,189.78 difference before any remnant credit. The slab count also uses area alone and cannot verify a physical cutting layout. The reported margin is after the job costs entered in the calculator. It does not establish company net profit after overhead. [Material costing and profit formula](https://github.com/KellyTPI/MasterCalculator/blob/83b4a5d0ca76524eab83b7c19a4b46ab39578903/index.html#L2485-L2498)
- **Demolition measurement.** “Sync to Counter SF” rounds to the nearest whole square foot. A 49 × 25.5 inch counter measures 8.67708 SF. Sync prices 9 SF of stone demolition at $189, while exact-area billing at $21/SF would be $182.22. Whether TPI bills demolition by whole or fractional SF determines which amount is appropriate. [Demolition sync](https://github.com/KellyTPI/MasterCalculator/blob/83b4a5d0ca76524eab83b7c19a4b46ab39578903/index.html#L2283-L2290)
