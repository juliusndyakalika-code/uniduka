-- Invoice numbers are claimed when an invoice is issued, not when the draft is
-- created, so an abandoned draft never burns a number and the sequence stays
-- gap-free. That in turn makes deleting an unissued draft safe.
--
-- Existing drafts keep the number they were already given; issuing them reuses
-- it rather than claiming another.

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "invoiceNo" DROP NOT NULL;
