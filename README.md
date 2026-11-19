# TPI Costco Hawaii Master Estimator

Top Priority, Inc. uses this browser app to prepare a Costco member’s countertop quote, split the payment between Centah and ActionFlow, and review job costs and margin.

**[Open the live estimator](https://kellytpi.github.io/MasterCalculator/)** · [Download the current app](https://github.com/KellyTPI/MasterCalculator/archive/refs/heads/main.zip) · [Contributor guide](#working-on-the-estimator)

## Prepare an estimate

| View | What to do |
| --- | --- |
| **Field Quote** | Enter the material, edge profile, piece dimensions and quantities. Add cutouts, custom work and any pre-tax discount. Use **Print / PDF** for the member’s quote and signature block. |
| **80/20 Split** | Review the 80% Costco deposit in Centah and 20% TPI balance in ActionFlow. Enter any direct TPI charges here. **Print Office Record / PDF** includes the quote, settlement and internal cost audit. |
| **COGS Audit** | Set shop labor and usable slab yield. Review material, labor and subcontractor costs against pre-tax net business revenue to see job profit and margin. |

New estimates start at zero square feet. The November 2026 program prices Tiers 1–4 at **$130, $150, $175 and $205 per square foot**, respectively. For a waterfall, enter the leg dimensions with the counter pieces and select waterfall labor separately. Reopened estimates from the original calculator retain their original rates, protection cost and waterfall allowance.

### Save, share and reopen

**Save Job** stores the estimate in the current browser. Use **Saved Jobs** to return to it. On a phone, these controls are labeled **Save** and **Jobs**.

| If you need to… | Use |
| --- | --- |
| Give the member a quote | **Field Quote → Print / PDF**. The customer copy shows the scope, total and payment schedule. |
| Keep an editable PDF for the office | **Field Quote → Save Editable PDF**. Reopen it with **Saved Jobs → Open Estimate PDF**, edit the draft, then save a new copy. The file contains internal costs. |
| Move one job to another device | **Saved Jobs → Save Current Estimate (.json)**, then **Open Estimate (.json)** on the other device. This also opens single-job files from the November standalone calculator. |
| Back up the saved-job list | **Saved Jobs → Export Backup (.json)**. **Import Backup (.json)** adds jobs and updates matching job IDs. Keep backups and editable files with the office records. |

## Working on the estimator

**Start each change from the latest GitHub `main`.** GitHub Pages publishes that branch. A downloaded ZIP works for trying the app locally. Extract it and open `index.html` with the `assets` folder beside it. For ongoing edits, clone the repository once so you can pull the team’s changes.

```sh
git clone https://github.com/KellyTPI/MasterCalculator.git
cd MasterCalculator
```

### Use Codex with ChatGPT Plus

Open **Codex** in the ChatGPT desktop app, sign in with the account that has Plus, and select the cloned **MasterCalculator** folder as your project. Choose a model and reasoning level in the Codex model selector. The available options depend on the account and workspace. [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)

| Suggested setting | When to use it on this project |
| --- | --- |
| **GPT-6.2 Sol · Medium** | Start here for everyday features, quote wording, layout changes and focused bug fixes. |
| **GPT-6.2 Sol · High** | Use for changes that span several workflows, such as a new field that must save, reopen and print correctly. |
| **GPT-6.2 Astra · Extra High** | Use when available for a difficult pricing discrepancy, a change to how older jobs load, or a substantial refactor. |

Higher reasoning levels take more time and use more of the account’s allowance. Choose the setting to fit the change. [OpenAI’s model and reasoning guide](https://learn.chatgpt.com/docs/models)

**A prompt to start a feature**

> Open the KellyTPI/MasterCalculator repository, fetch the latest main, and create a feature branch from it. Add [describe the change and what someone should see when it works]. Preserve existing estimates and quote math except where the request changes them. Run the estimator tests and try the affected workflow in a browser. Open a draft pull request with a short summary and steps I can use to check it.

### Test and publish a change

From the repository root, run the regression tests with Node.js. The suite uses Node’s built-in test runner.

```sh
node --test tests/estimate.test.cjs
```

For a quick pricing check, start a new Tier 1 quote. Enter one **12 × 12 inch** counter, turn off the protection plan, and leave the other fields at their defaults. The subtotal should be **$130.00**, the total with Hawaii GET **$136.13**, and the two payments **$108.90** and **$27.23**.

For changes to saved data or printed output, also reopen an older estimate and inspect the member quote and office record in print preview. Use sample jobs for shared screenshots and test files. Review the pull request, merge it into `main` when ready, then check the live estimator after the Pages deployment finishes.

### Repository guide

| File | What it contains |
| --- | --- |
| [index.html](index.html) | App interface, pricing schedules, saved-job handling and the shared `calculateEstimate` function. |
| [assets/estimate-pdf.js](assets/estimate-pdf.js) | Creation and reopening of editable PDF work copies. PDF processing runs in the browser using bundled [pdf-lib 1.17.1](https://github.com/Hopding/pdf-lib/tree/v1.17.1) under its [MIT license](assets/pdf-lib-LICENSE.md). |
| [tests/estimate.test.cjs](tests/estimate.test.cjs) | Regression cases for pricing, payment rounding, margins and compatibility with older estimates. |
| [CALCULATION-AUDIT.md](CALCULATION-AUDIT.md) | Historical findings, worked examples and the business assumptions behind the original calculation review. |
