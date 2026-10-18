"""Link to the separate, self-hosted inventory app (the shop's stock system).

This is the site's only integration apart from payments, shipping and SMS. It is
deliberately one-directional in each direction:

* ``sync_stock_from_inventory``   pulls stock levels from the inventory app into
  ``inventory.on_hand`` here (every 15 minutes via Celery beat).
* ``post_order_stock_out``         pushes one stock-out movement per order item when a
  web order is paid, keyed by the order item id so retries are idempotent.

Both no-op with a log line when ``INVENTORY_API_URL`` / ``INVENTORY_API_KEY`` are unset.
"""
