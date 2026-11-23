-- Update saved policy text without changing any other approved business settings.
do $$
declare policy_key text;
begin
  foreach policy_key in array array['privacy_text','refund_text','shipping_text'] loop
    update public.settings
    set public_data = jsonb_set(
      public_data,
      array[policy_key],
      to_jsonb(replace(public_data->>policy_key,
        'support@myreliefpoint.com', 'support@reliefpointpharmacy.com'))
    )
    where jsonb_typeof(public_data->policy_key) = 'string'
      and position('support@myreliefpoint.com' in public_data->>policy_key) > 0;
  end loop;
end;
$$;

-- Correct unsent staff enquiry notifications, preserving sent-message history.
-- Do not reset attempts/status or automatically resend previously failed messages.
update public.notification_outbox
set email = 'support@reliefpointpharmacy.com'
where email = 'support@myreliefpoint.com'
  and dedupe like 'contact:%'
  and status in ('pending','failed');
