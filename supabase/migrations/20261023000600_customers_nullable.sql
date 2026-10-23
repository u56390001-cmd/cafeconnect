-- customers can exist without a phone identity (web customers start
-- profile-less); phone identification lives in customer_identities.
alter table customers alter column phone_hash drop not null;
alter table customers alter column phone drop not null;
alter table customers alter column name drop not null;
