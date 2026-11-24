-- Flexible purchase source for phones and devices. Additive only: three nullable columns, no existing data changed.
ALTER TABLE `SoldUnit` ADD COLUMN `purchaseSource` VARCHAR(191) NULL,
    ADD COLUMN `purchaseNote` VARCHAR(191) NULL,
    ADD COLUMN `purchasedAt` DATETIME(3) NULL;
