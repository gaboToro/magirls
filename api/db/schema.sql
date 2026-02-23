-- Ma' Girls (Phase I) - PostgreSQL schema (DDL)
-- Includes: enums, tables, constraints, indexes, helpful triggers
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE stock_movement_type AS ENUM (
    'INCREASE_SCAN',
    'DECREASE_SALE',
    'ADJUSTMENT',
    'INTERNAL_USE',
    'DAMAGE',
    'WASTE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sale_status AS ENUM (
    'DRAFT',
    'CONFIRMED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username         VARCHAR(100) UNIQUE NOT NULL,
  password_hash    TEXT NOT NULL,
  full_name        VARCHAR(200),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS devices (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_name      VARCHAR(200),
  platform         VARCHAR(50),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type           VARCHAR(100) NOT NULL,
  entity_type          VARCHAR(100),
  entity_id            TEXT,
  metadata             JSONB,
  performed_by_user_id UUID NOT NULL REFERENCES users(id),
  device_id            UUID REFERENCES devices(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(250) NOT NULL,
  brand       VARCHAR(150),
  category    VARCHAR(150),
  description TEXT,
  photo_url   TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

CREATE TABLE IF NOT EXISTS product_variants (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_name   VARCHAR(250),
  color          VARCHAR(80),
  size           VARCHAR(80),
  purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  sale_price     NUMERIC(12,2) NOT NULL DEFAULT 0,
  location       VARCHAR(200),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_variant_unique_per_product UNIQUE (product_id, color, size)
);

CREATE TRIGGER trg_product_variants_updated_at
BEFORE UPDATE ON product_variants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_color ON product_variants(color);
CREATE INDEX IF NOT EXISTS idx_variants_size ON product_variants(size);

CREATE TABLE IF NOT EXISTS barcodes (
  code       VARCHAR(200) PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS barcode_variants (
  barcode_code VARCHAR(200) NOT NULL REFERENCES barcodes(code) ON DELETE CASCADE,
  variant_id   UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (barcode_code, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_barcode_variants_barcode ON barcode_variants(barcode_code);
CREATE INDEX IF NOT EXISTS idx_barcode_variants_variant ON barcode_variants(variant_id);

CREATE TABLE IF NOT EXISTS warehouses (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(150) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  variant_id   UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  batch_code   VARCHAR(150),
  expires_at   DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_batch_unique UNIQUE (warehouse_id, variant_id, batch_code, expires_at)
);

CREATE INDEX IF NOT EXISTS idx_batches_variant_id ON inventory_batches(variant_id);
CREATE INDEX IF NOT EXISTS idx_batches_expires_at ON inventory_batches(expires_at);

CREATE TABLE IF NOT EXISTS stock_balances (
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  batch_id     UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  qty_on_hand  INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id, batch_id),
  CONSTRAINT ck_stock_balances_non_negative CHECK (qty_on_hand >= 0)
);

CREATE INDEX IF NOT EXISTS idx_stock_balances_batch ON stock_balances(batch_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id         UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  batch_id             UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE RESTRICT,
  variant_id           UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  movement_type        stock_movement_type NOT NULL,
  qty_delta            INTEGER NOT NULL,
  reason               TEXT,
  reference_sale_id    UUID,
  performed_by_user_id UUID NOT NULL REFERENCES users(id),
  device_id            UUID REFERENCES devices(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_variant_time ON stock_movements(variant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch_time ON stock_movements(batch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);

CREATE TABLE IF NOT EXISTS customers (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name  VARCHAR(200) NOT NULL,
  phone      VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id       UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  ticket_number      BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  customer_id        UUID REFERENCES customers(id),
  customer_name      VARCHAR(200),
  subtotal           NUMERIC(12,2) NOT NULL DEFAULT 0,
  total              NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency           CHAR(3) NOT NULL DEFAULT 'USD',
  status             sale_status NOT NULL DEFAULT 'CONFIRMED',
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);

CREATE TABLE IF NOT EXISTS sale_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id      UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  variant_id   UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  barcode_code VARCHAR(200) REFERENCES barcodes(code),
  qty          INTEGER NOT NULL,
  unit_price   NUMERIC(12,2) NOT NULL,
  line_total   NUMERIC(12,2) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_sale_items_qty_positive CHECK (qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_variant_id ON sale_items(variant_id);

DO $$ BEGIN
  ALTER TABLE stock_movements
    ADD CONSTRAINT fk_stock_movements_reference_sale
    FOREIGN KEY (reference_sale_id) REFERENCES sales(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION prevent_negative_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.qty_on_hand < 0 THEN
    RAISE EXCEPTION 'Stock cannot be negative (warehouse_id=%, batch_id=%)', NEW.warehouse_id, NEW.batch_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_negative_stock ON stock_balances;
CREATE TRIGGER trg_prevent_negative_stock
BEFORE INSERT OR UPDATE ON stock_balances
FOR EACH ROW EXECUTE FUNCTION prevent_negative_stock();

CREATE OR REPLACE VIEW v_variant_stock AS
SELECT
  b.warehouse_id,
  ib.variant_id,
  SUM(b.qty_on_hand)::INT AS qty_on_hand
FROM stock_balances b
JOIN inventory_batches ib ON ib.id = b.batch_id
GROUP BY b.warehouse_id, ib.variant_id;
