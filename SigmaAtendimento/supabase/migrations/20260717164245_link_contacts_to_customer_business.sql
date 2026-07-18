alter table public."Contact"
add column "business_id" text;

alter table public."Contact"
add constraint "Contact_business_id_fkey"
foreign key ("business_id")
references public."CustomerBusiness" (id)
on update cascade
on delete set null;

create index "Contact_business_id_idx"
on public."Contact" ("business_id");
