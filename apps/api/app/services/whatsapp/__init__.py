"""WhatsApp Business (Meta Cloud API) adapter. Activates when WHATSAPP_PHONE_NUMBER_ID and
WHATSAPP_ACCESS_TOKEN are set; otherwise every send is a log line.

Only approved *template* messages can start a conversation, so each notification here maps
to a template you create and get approved in Meta Business Manager. Template names are in
``TEMPLATES`` below and must match exactly what you register.
"""
