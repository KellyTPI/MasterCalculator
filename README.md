# MasterCalculator
TPI Costco SF Master Calculator

## Editable estimate PDFs

1. In **Field Quote**, select **Save Editable PDF** to download a work copy.
2. In **Saved Jobs**, select **Open Estimate PDF** and choose the work copy. The calculator restores the inputs as a draft.
3. Edit the job and save a new PDF. The original file stays available as a record of the earlier quote.

An editable work copy includes the full estimate, including internal costs. Use **Print / PDF** for the customer-facing quote. The editor can reopen PDFs created with **Save Editable PDF**.

For a local copy, download the repository ZIP, extract it, and open `index.html` with the `assets` folder beside it. PDF processing runs inside the browser with the bundled [pdf-lib 1.17.1](https://github.com/Hopding/pdf-lib/tree/v1.17.1) under its [MIT license](assets/pdf-lib-LICENSE.md).

## Field and office estimates

New estimates start at zero square feet. The November pricing schedule uses installed rates of $130, $150, $175 and $205 per SF. Enter waterfall leg dimensions with the counters and select waterfall labor separately. Saved estimates and editable PDFs from the original calculator retain their original prices, protection cost and waterfall allowance.

- **Field Quote** supports piece quantities, edge profiles, included cutouts, custom lines and pre-tax discounts. **Print / PDF** produces the member quote with the signature block.
- **80/20 Split** includes the Centah deposit, ActionFlow balance and direct TPI charges. **Print Office Record / PDF** includes the member quote, office settlement and manager costs.
- **COGS Audit** lets the estimator set shop labor and usable slab yield. Job profit is pre-tax net business revenue less job costs.
- **Saved Jobs** can save or open one estimate as JSON, including single-estimate files from the November standalone calculator. **Export Backup** and **Import Backup** transfer the whole saved-job list. Single-estimate JSON and editable PDFs are internal work copies.
