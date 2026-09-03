-- Atomically append confirmed chat proposals to existing manual notes.

create or replace function public.append_to_manual_note(
  p_document_id uuid,
  p_family_id uuid,
  p_append_content text
)
returns table (
  result_status text,
  note_title text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_note public.documents%rowtype;
  v_addition text := trim(coalesce(p_append_content, ''));
  v_content text;
begin
  select *
  into v_note
  from public.documents
  where id = p_document_id
    and family_id = p_family_id
  for update;

  if not found then
    return query select 'not_found'::text, null::text;
    return;
  end if;

  if v_note.source <> 'manual'
    or v_note.status <> 'confirmed'
    or v_note.document_type = 'credentials'
  then
    return query select 'invalid_note'::text, v_note.title;
    return;
  end if;

  v_content := trim(coalesce(v_note.ocr_text, ''));

  if v_addition = '' then
    return query select 'invalid_note'::text, v_note.title;
    return;
  end if;

  if position(v_addition in v_content) > 0 then
    return query select 'already_updated'::text, v_note.title;
    return;
  end if;

  v_content := case
    when v_content = '' then v_addition
    else v_content || E'\n\n' || v_addition
  end;

  if char_length(v_content) > 10000 then
    return query select 'too_long'::text, v_note.title;
    return;
  end if;

  update public.documents
  set ocr_text = v_content
  where id = p_document_id
    and family_id = p_family_id;

  update public.document_pages
  set ocr_markdown = v_content
  where document_id = p_document_id
    and page_number = 1;

  if not found then
    insert into public.document_pages (
      document_id,
      page_number,
      ocr_markdown
    )
    values (
      p_document_id,
      1,
      v_content
    );
  end if;

  return query select 'updated'::text, v_note.title;
end;
$$;

revoke execute on function public.append_to_manual_note(uuid, uuid, text)
  from public;
grant execute on function public.append_to_manual_note(uuid, uuid, text)
  to authenticated;
