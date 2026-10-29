create or replace function gis.check_structure_attachment() returns trigger as $$
declare
structure_type text;
  rule_exists boolean;
begin
  if new.structure_id is null then
    return new;
end if;

select s.type into structure_type
from gis.structures s
where s.id = new.structure_id and s.is_head = true
    limit 1;

if structure_type is null then
    raise exception 'structure_id % does not reference an existing structure', new.structure_id;
end if;

select exists (
    select 1 from gis.structure_attachment_rules r
    where r.node_type = new.type and r.structure_type = structure_type
) into rule_exists;

if not rule_exists then
    raise exception 'node type % may not be housed in structure type %', new.type, structure_type;
end if;

return new;
end;
$$ language plpgsql;

drop trigger if exists enforce_structure_attachment on gis.nodes;
create trigger enforce_structure_attachment
    before insert or update on gis.nodes
                         for each row
                         execute function gis.check_structure_attachment();