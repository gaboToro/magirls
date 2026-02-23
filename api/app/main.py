from decimal import Decimal
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.inventory import (
    InventoryByCodeResponse,
    InventoryListItem,
    InventoryUpdateRequest,
    LowStockItem,
    ScanUpsertRequest,
    StockIncreaseRequest,
)
from app.schemas.sales import CheckoutRequest, CheckoutResponse, DashboardSummary
from app.services.deps import get_current_user

app = FastAPI(title="Ma' Girls API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def ensure_default_warehouse(db: Session) -> str:
    warehouse = db.execute(
        text("SELECT id::text AS id FROM warehouses ORDER BY created_at ASC LIMIT 1")
    ).mappings().first()

    if warehouse:
        return warehouse["id"]

    created = db.execute(
        text("INSERT INTO warehouses (name) VALUES ('Main Warehouse') RETURNING id::text AS id")
    ).mappings().first()
    return created["id"]


def ensure_default_batch(db: Session, warehouse_id: str, variant_id: str) -> str:
    batch = db.execute(
        text(
            """
            SELECT id::text AS id
            FROM inventory_batches
            WHERE warehouse_id = CAST(:warehouse_id AS uuid)
              AND variant_id = CAST(:variant_id AS uuid)
              AND batch_code = 'DEFAULT'
              AND expires_at IS NULL
            LIMIT 1
            """
        ),
        {"warehouse_id": warehouse_id, "variant_id": variant_id},
    ).mappings().first()

    if batch:
        return batch["id"]

    created = db.execute(
        text(
            """
            INSERT INTO inventory_batches (warehouse_id, variant_id, batch_code, expires_at)
            VALUES (CAST(:warehouse_id AS uuid), CAST(:variant_id AS uuid), 'DEFAULT', NULL)
            RETURNING id::text AS id
            """
        ),
        {"warehouse_id": warehouse_id, "variant_id": variant_id},
    ).mappings().first()
    return created["id"]


def get_variant_by_code(db: Session, code: str) -> dict[str, Any] | None:
    row = db.execute(
        text(
            """
            SELECT
              pv.id::text AS variant_id,
              p.name AS product_name,
              COALESCE(pv.variant_name, CONCAT_WS(' / ', pv.color, pv.size)) AS variant_name,
              pv.sale_price,
              pv.purchase_price,
              COALESCE(vs.qty_on_hand, 0) AS qty_on_hand
            FROM barcode_variants bv
            JOIN product_variants pv ON pv.id = bv.variant_id
            JOIN products p ON p.id = pv.product_id
            LEFT JOIN v_variant_stock vs ON vs.variant_id = pv.id
            WHERE bv.barcode_code = :code
              AND p.is_active = TRUE
              AND pv.is_active = TRUE
            LIMIT 1
            """
        ),
        {"code": code},
    ).mappings().first()

    return dict(row) if row else None


def list_inventory_items(db: Session) -> list[dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT
              pv.id::text AS variant_id,
              p.name AS product_name,
              COALESCE(pv.variant_name, CONCAT_WS(' / ', pv.color, pv.size)) AS variant_name,
              p.category,
              p.brand,
              pv.location,
              p.photo_url,
              pv.sale_price,
              pv.purchase_price,
              COALESCE(vs.qty_on_hand, 0) AS qty_on_hand,
              (
                SELECT bv.barcode_code
                FROM barcode_variants bv
                WHERE bv.variant_id = pv.id
                ORDER BY bv.is_primary DESC, bv.created_at ASC
                LIMIT 1
              ) AS primary_code
            FROM product_variants pv
            JOIN products p ON p.id = pv.product_id
            LEFT JOIN v_variant_stock vs ON vs.variant_id = pv.id
            WHERE p.is_active = TRUE AND pv.is_active = TRUE
            ORDER BY p.name ASC, variant_name ASC
            """
        )
    ).mappings().all()
    return [dict(row) for row in rows]


def get_inventory_item_by_variant(db: Session, variant_id: str) -> dict[str, Any] | None:
    row = db.execute(
        text(
            """
            SELECT
              pv.id::text AS variant_id,
              p.id::text AS product_id,
              p.name AS product_name,
              p.brand,
              p.category,
              p.description,
              p.photo_url,
              COALESCE(pv.variant_name, CONCAT_WS(' / ', pv.color, pv.size)) AS variant_name,
              pv.color,
              pv.size,
              pv.location,
              pv.sale_price,
              pv.purchase_price,
              COALESCE(vs.qty_on_hand, 0) AS qty_on_hand,
              (
                SELECT bv.barcode_code
                FROM barcode_variants bv
                WHERE bv.variant_id = pv.id
                ORDER BY bv.is_primary DESC, bv.created_at ASC
                LIMIT 1
              ) AS primary_code
            FROM product_variants pv
            JOIN products p ON p.id = pv.product_id
            LEFT JOIN v_variant_stock vs ON vs.variant_id = pv.id
            WHERE pv.id = CAST(:variant_id AS uuid)
              AND p.is_active = TRUE
              AND pv.is_active = TRUE
            LIMIT 1
            """
        ),
        {"variant_id": variant_id},
    ).mappings().first()
    return dict(row) if row else None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.execute(
        text(
            """
            SELECT id::text AS id, username, password_hash, full_name, is_active
            FROM users
            WHERE username = :username
            LIMIT 1
            """
        ),
        {"username": payload.username},
    ).mappings().first()

    if not user or not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    db.execute(
        text("UPDATE users SET last_login_at = now() WHERE id = CAST(:id AS uuid)"),
        {"id": user["id"]},
    )
    db.commit()

    token = create_access_token(subject=user["id"])
    return TokenResponse(
        access_token=token,
        user_id=user["id"],
        username=user["username"],
        full_name=user["full_name"],
    )


@app.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    metrics = db.execute(
        text(
            """
            WITH invested AS (
              SELECT COALESCE(SUM(vs.qty_on_hand * pv.purchase_price), 0) AS amount
              FROM v_variant_stock vs
              JOIN product_variants pv ON pv.id = vs.variant_id
              JOIN products p ON p.id = pv.product_id
              WHERE pv.is_active = TRUE
                AND p.is_active = TRUE
                AND vs.qty_on_hand > 0
            ),
            sales_gross AS (
              SELECT COALESCE(SUM(total), 0) AS amount
              FROM sales
              WHERE status = 'CONFIRMED'
            ),
            cogs AS (
              SELECT COALESCE(SUM(si.qty * pv.purchase_price), 0) AS amount
              FROM sale_items si
              JOIN sales s ON s.id = si.sale_id
              JOIN product_variants pv ON pv.id = si.variant_id
              WHERE s.status = 'CONFIRMED'
            )
            SELECT
              invested.amount AS invested_amount,
              sales_gross.amount AS gross_sales,
              cogs.amount AS cost_of_goods_sold,
              (sales_gross.amount - cogs.amount) AS profit
            FROM invested, sales_gross, cogs
            """
        )
    ).mappings().first()

    return DashboardSummary(
        invested_amount=float(metrics["invested_amount"]),
        gross_sales=float(metrics["gross_sales"]),
        cost_of_goods_sold=float(metrics["cost_of_goods_sold"]),
        profit=float(metrics["profit"]),
    )


@app.post("/catalog/scan-upsert")
def scan_upsert(
    payload: ScanUpsertRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    existing = get_variant_by_code(db, payload.code)
    if existing:
        return {"created": False, "message": "Code already exists", "variant": existing}

    warehouse_id = ensure_default_warehouse(db)

    try:
        product = db.execute(
            text(
                """
                INSERT INTO products (name, brand, category, description, photo_url)
                VALUES (:name, :brand, :category, :description, :photo_url)
                RETURNING id::text AS id
                """
            ),
            {
                "name": payload.product_name,
                "brand": payload.brand,
                "category": payload.category,
                "description": payload.description,
                "photo_url": payload.photo_url,
            },
        ).mappings().first()

        variant = db.execute(
            text(
                """
                INSERT INTO product_variants (
                  product_id,
                  variant_name,
                  color,
                  size,
                  location,
                  purchase_price,
                  sale_price
                )
                VALUES (
                  CAST(:product_id AS uuid),
                  :variant_name,
                  :color,
                  :size,
                  :location,
                  :purchase_price,
                  :sale_price
                )
                RETURNING id::text AS id
                """
            ),
            {
                "product_id": product["id"],
                "variant_name": payload.variant_name,
                "color": payload.color,
                "size": payload.size,
                "location": payload.location,
                "purchase_price": payload.purchase_price,
                "sale_price": payload.sale_price,
            },
        ).mappings().first()

        db.execute(
            text("INSERT INTO barcodes (code) VALUES (:code) ON CONFLICT (code) DO NOTHING"),
            {"code": payload.code},
        )

        db.execute(
            text(
                """
                INSERT INTO barcode_variants (barcode_code, variant_id, is_primary)
                VALUES (:code, CAST(:variant_id AS uuid), TRUE)
                """
            ),
            {"code": payload.code, "variant_id": variant["id"]},
        )

        batch_id = ensure_default_batch(db, warehouse_id, variant["id"])

        db.execute(
            text(
                """
                INSERT INTO stock_balances (warehouse_id, batch_id, qty_on_hand)
                VALUES (CAST(:warehouse_id AS uuid), CAST(:batch_id AS uuid), :qty)
                ON CONFLICT (warehouse_id, batch_id)
                DO UPDATE SET qty_on_hand = stock_balances.qty_on_hand + EXCLUDED.qty_on_hand,
                              updated_at = now()
                """
            ),
            {"warehouse_id": warehouse_id, "batch_id": batch_id, "qty": payload.initial_qty},
        )

        if payload.initial_qty > 0:
            db.execute(
                text(
                    """
                    INSERT INTO stock_movements (
                      warehouse_id,
                      batch_id,
                      variant_id,
                      movement_type,
                      qty_delta,
                      reason,
                      performed_by_user_id
                    )
                    VALUES (
                      CAST(:warehouse_id AS uuid),
                      CAST(:batch_id AS uuid),
                      CAST(:variant_id AS uuid),
                      CAST('INCREASE_SCAN' AS stock_movement_type),
                      :qty_delta,
                      :reason,
                      CAST(:user_id AS uuid)
                    )
                    """
                ),
                {
                    "warehouse_id": warehouse_id,
                    "batch_id": batch_id,
                    "variant_id": variant["id"],
                    "qty_delta": payload.initial_qty,
                    "reason": "Initial stock on scan upsert",
                    "user_id": user["id"],
                },
            )

        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to upsert scanned product: {exc.orig}")

    created_variant = get_variant_by_code(db, payload.code)
    return {"created": True, "variant": created_variant}


@app.get("/inventory/by-code/{code}", response_model=InventoryByCodeResponse)
def inventory_by_code(
    code: str,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    variant = get_variant_by_code(db, code)
    if not variant:
        raise HTTPException(status_code=404, detail="Code not found")

    return InventoryByCodeResponse(
        code=code,
        variant_id=variant["variant_id"],
        product_name=variant["product_name"],
        variant_name=variant["variant_name"],
        sale_price=float(variant["sale_price"]),
        purchase_price=float(variant["purchase_price"]),
        qty_on_hand=int(variant["qty_on_hand"]),
    )


@app.get("/inventory/items", response_model=list[InventoryListItem])
def inventory_items(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    rows = list_inventory_items(db)
    return [
        InventoryListItem(
            variant_id=row["variant_id"],
            product_name=row["product_name"],
            variant_name=row["variant_name"],
            category=row["category"],
            brand=row["brand"],
            location=row["location"],
            photo_url=row["photo_url"],
            sale_price=float(row["sale_price"]),
            purchase_price=float(row["purchase_price"]),
            qty_on_hand=int(row["qty_on_hand"]),
            primary_code=row["primary_code"],
        )
        for row in rows
    ]


@app.patch("/inventory/items/{variant_id}", response_model=InventoryListItem)
def update_inventory_item(
    variant_id: str,
    payload: InventoryUpdateRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    current = get_inventory_item_by_variant(db, variant_id)
    if not current:
        raise HTTPException(status_code=404, detail="Variant not found")

    data = payload.model_dump(exclude_unset=True)
    product_updates = {
        "product_name": data.get("product_name", current["product_name"]),
        "brand": data.get("brand", current["brand"]),
        "category": data.get("category", current["category"]),
        "description": data.get("description", current["description"]),
        "photo_url": data.get("photo_url", current["photo_url"]),
    }
    variant_updates = {
        "variant_name": data.get("variant_name", current["variant_name"]),
        "color": data.get("color", current["color"]),
        "size": data.get("size", current["size"]),
        "location": data.get("location", current["location"]),
        "purchase_price": current["purchase_price"]
        if data.get("purchase_price", current["purchase_price"]) is None
        else data.get("purchase_price", current["purchase_price"]),
        "sale_price": current["sale_price"]
        if data.get("sale_price", current["sale_price"]) is None
        else data.get("sale_price", current["sale_price"]),
    }

    try:
        db.execute(
            text(
                """
                UPDATE products
                SET
                  name = :name,
                  brand = :brand,
                  category = :category,
                  description = :description,
                  photo_url = :photo_url,
                  updated_at = now()
                WHERE id = CAST(:product_id AS uuid)
                """
            ),
            {
                "name": product_updates["product_name"],
                "brand": product_updates["brand"],
                "category": product_updates["category"],
                "description": product_updates["description"],
                "photo_url": product_updates["photo_url"],
                "product_id": current["product_id"],
            },
        )

        db.execute(
            text(
                """
                UPDATE product_variants
                SET
                  variant_name = :variant_name,
                  color = :color,
                  size = :size,
                  location = :location,
                  purchase_price = :purchase_price,
                  sale_price = :sale_price,
                  updated_at = now()
                WHERE id = CAST(:variant_id AS uuid)
                """
            ),
            {
                "variant_name": variant_updates["variant_name"],
                "color": variant_updates["color"],
                "size": variant_updates["size"],
                "location": variant_updates["location"],
                "purchase_price": variant_updates["purchase_price"],
                "sale_price": variant_updates["sale_price"],
                "variant_id": variant_id,
            },
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Update failed: {exc.orig}")

    updated = get_inventory_item_by_variant(db, variant_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Variant not found after update")

    return InventoryListItem(
        variant_id=updated["variant_id"],
        product_name=updated["product_name"],
        variant_name=updated["variant_name"],
        category=updated["category"],
        brand=updated["brand"],
        location=updated["location"],
        photo_url=updated["photo_url"],
        sale_price=float(updated["sale_price"]),
        purchase_price=float(updated["purchase_price"]),
        qty_on_hand=int(updated["qty_on_hand"]),
        primary_code=updated["primary_code"],
    )


@app.delete("/inventory/items/{variant_id}")
def delete_inventory_item(
    variant_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    current = db.execute(
        text(
            """
            SELECT
              pv.id::text AS variant_id,
              p.id::text AS product_id
            FROM product_variants pv
            JOIN products p ON p.id = pv.product_id
            WHERE pv.id = CAST(:variant_id AS uuid)
            LIMIT 1
            """
        ),
        {"variant_id": variant_id},
    ).mappings().first()

    if not current:
        raise HTTPException(status_code=404, detail="Variant not found")

    product_id = current["product_id"]

    try:
        db.execute(
            text(
                """
                UPDATE product_variants
                SET is_active = FALSE,
                    updated_at = now()
                WHERE id = CAST(:variant_id AS uuid)
                """
            ),
            {"variant_id": variant_id},
        )

        remaining = db.execute(
            text(
                """
                SELECT COUNT(*)::int AS count
                FROM product_variants
                WHERE product_id = CAST(:product_id AS uuid)
                  AND is_active = TRUE
                """
            ),
            {"product_id": product_id},
        ).mappings().first()

        if remaining and remaining["count"] == 0:
            db.execute(
                text(
                    """
                    UPDATE products
                    SET is_active = FALSE,
                        updated_at = now()
                    WHERE id = CAST(:product_id AS uuid)
                    """
                ),
                {"product_id": product_id},
            )

        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Delete failed: {exc.orig}")

    return {"ok": True, "deleted_variant_id": variant_id}


@app.get("/inventory/alerts/low-stock", response_model=list[LowStockItem])
def low_stock_alerts(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    rows = db.execute(
        text(
            """
            SELECT
              pv.id::text AS variant_id,
              p.name AS product_name,
              COALESCE(pv.variant_name, CONCAT_WS(' / ', pv.color, pv.size)) AS variant_name,
              COALESCE(vs.qty_on_hand, 0) AS qty_on_hand,
              (
                SELECT bv.barcode_code
                FROM barcode_variants bv
                WHERE bv.variant_id = pv.id
                ORDER BY bv.is_primary DESC, bv.created_at ASC
                LIMIT 1
              ) AS primary_code
            FROM product_variants pv
            JOIN products p ON p.id = pv.product_id
            LEFT JOIN v_variant_stock vs ON vs.variant_id = pv.id
            WHERE COALESCE(vs.qty_on_hand, 0) <= 1
              AND p.is_active = TRUE
              AND pv.is_active = TRUE
            ORDER BY qty_on_hand ASC, p.name ASC
            """
        )
    ).mappings().all()

    return [
        LowStockItem(
            variant_id=row["variant_id"],
            product_name=row["product_name"],
            variant_name=row["variant_name"],
            qty_on_hand=int(row["qty_on_hand"]),
            primary_code=row["primary_code"],
        )
        for row in rows
    ]


@app.post("/inventory/scan-increase")
def scan_increase(
    payload: StockIncreaseRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    variant = get_variant_by_code(db, payload.code)
    if not variant:
        raise HTTPException(status_code=404, detail="Code not found")

    warehouse_id = ensure_default_warehouse(db)
    batch_id = ensure_default_batch(db, warehouse_id, variant["variant_id"])

    db.execute(
        text(
            """
            INSERT INTO stock_balances (warehouse_id, batch_id, qty_on_hand)
            VALUES (CAST(:warehouse_id AS uuid), CAST(:batch_id AS uuid), :qty)
            ON CONFLICT (warehouse_id, batch_id)
            DO UPDATE SET qty_on_hand = stock_balances.qty_on_hand + EXCLUDED.qty_on_hand,
                          updated_at = now()
            """
        ),
        {"warehouse_id": warehouse_id, "batch_id": batch_id, "qty": payload.qty},
    )

    db.execute(
        text(
            """
            INSERT INTO stock_movements (
              warehouse_id,
              batch_id,
              variant_id,
              movement_type,
              qty_delta,
              reason,
              performed_by_user_id
            )
            VALUES (
              CAST(:warehouse_id AS uuid),
              CAST(:batch_id AS uuid),
              CAST(:variant_id AS uuid),
              CAST('INCREASE_SCAN' AS stock_movement_type),
              :qty_delta,
              :reason,
              CAST(:user_id AS uuid)
            )
            """
        ),
        {
            "warehouse_id": warehouse_id,
            "batch_id": batch_id,
            "variant_id": variant["variant_id"],
            "qty_delta": payload.qty,
            "reason": payload.reason or "Stock increase from mobile scan",
            "user_id": user["id"],
        },
    )

    db.commit()
    updated = get_variant_by_code(db, payload.code)
    return {"ok": True, "updated_stock": int(updated["qty_on_hand"]) if updated else None}


@app.post("/sales/checkout", response_model=CheckoutResponse)
def checkout(
    payload: CheckoutRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if not payload.items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    warehouse_id = ensure_default_warehouse(db)

    customer_id: str | None = None
    subtotal = Decimal("0")
    sale_items: list[dict[str, Any]] = []

    for item in payload.items:
        variant = get_variant_by_code(db, item.code)
        if not variant:
            raise HTTPException(status_code=404, detail=f"Code not found: {item.code}")

        available = int(variant["qty_on_hand"])
        if available <= 0:
            raise HTTPException(status_code=400, detail=f"Out of stock: {variant['product_name']}")
        if item.qty > available:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {variant['product_name']}. Available: {available}",
            )

        unit_price = Decimal(str(variant["sale_price"]))
        line_total = unit_price * Decimal(item.qty)
        subtotal += line_total

        sale_items.append(
            {
                "code": item.code,
                "variant_id": variant["variant_id"],
                "qty": item.qty,
                "unit_price": unit_price,
                "line_total": line_total,
                "name": variant["product_name"],
            }
        )

    try:
        if payload.customer_name:
            existing_customer = db.execute(
                text(
                    """
                    SELECT id::text AS id
                    FROM customers
                    WHERE full_name = :full_name
                      AND COALESCE(phone, '') = COALESCE(:phone, '')
                    LIMIT 1
                    """
                ),
                {"full_name": payload.customer_name, "phone": payload.customer_phone},
            ).mappings().first()

            if existing_customer:
                customer_id = existing_customer["id"]
            else:
                created_customer = db.execute(
                    text(
                        """
                        INSERT INTO customers (full_name, phone)
                        VALUES (:full_name, :phone)
                        RETURNING id::text AS id
                        """
                    ),
                    {"full_name": payload.customer_name, "phone": payload.customer_phone},
                ).mappings().first()
                customer_id = created_customer["id"]

        sale = db.execute(
            text(
                """
                INSERT INTO sales (
                  warehouse_id,
                  customer_id,
                  customer_name,
                  subtotal,
                  total,
                  currency,
                  status,
                  created_by_user_id
                )
                VALUES (
                  CAST(:warehouse_id AS uuid),
                  CAST(:customer_id AS uuid),
                  :customer_name,
                  :subtotal,
                  :total,
                  'USD',
                  CAST('CONFIRMED' AS sale_status),
                  CAST(:created_by_user_id AS uuid)
                )
                RETURNING id::text AS id, ticket_number
                """
            ),
            {
                "warehouse_id": warehouse_id,
                "customer_id": customer_id,
                "customer_name": payload.customer_name,
                "subtotal": subtotal,
                "total": subtotal,
                "created_by_user_id": user["id"],
            },
        ).mappings().first()

        for item in sale_items:
            db.execute(
                text(
                    """
                    INSERT INTO sale_items (
                      sale_id,
                      variant_id,
                      barcode_code,
                      qty,
                      unit_price,
                      line_total
                    )
                    VALUES (
                      CAST(:sale_id AS uuid),
                      CAST(:variant_id AS uuid),
                      :barcode_code,
                      :qty,
                      :unit_price,
                      :line_total
                    )
                    """
                ),
                {
                    "sale_id": sale["id"],
                    "variant_id": item["variant_id"],
                    "barcode_code": item["code"],
                    "qty": item["qty"],
                    "unit_price": item["unit_price"],
                    "line_total": item["line_total"],
                },
            )

            remaining = item["qty"]
            batches = db.execute(
                text(
                    """
                    SELECT
                      sb.batch_id::text AS batch_id,
                      sb.qty_on_hand
                    FROM stock_balances sb
                    JOIN inventory_batches ib ON ib.id = sb.batch_id
                    WHERE sb.warehouse_id = CAST(:warehouse_id AS uuid)
                      AND ib.variant_id = CAST(:variant_id AS uuid)
                      AND sb.qty_on_hand > 0
                    ORDER BY ib.created_at ASC
                    """
                ),
                {"warehouse_id": warehouse_id, "variant_id": item["variant_id"]},
            ).mappings().all()

            if not batches:
                raise HTTPException(status_code=400, detail=f"No available stock batches for {item['name']}")

            for batch in batches:
                if remaining <= 0:
                    break
                available = int(batch["qty_on_hand"])
                take = min(available, remaining)

                db.execute(
                    text(
                        """
                        UPDATE stock_balances
                        SET qty_on_hand = qty_on_hand - :take,
                            updated_at = now()
                        WHERE warehouse_id = CAST(:warehouse_id AS uuid)
                          AND batch_id = CAST(:batch_id AS uuid)
                        """
                    ),
                    {"take": take, "warehouse_id": warehouse_id, "batch_id": batch["batch_id"]},
                )

                db.execute(
                    text(
                        """
                        INSERT INTO stock_movements (
                          warehouse_id,
                          batch_id,
                          variant_id,
                          movement_type,
                          qty_delta,
                          reason,
                          reference_sale_id,
                          performed_by_user_id
                        )
                        VALUES (
                          CAST(:warehouse_id AS uuid),
                          CAST(:batch_id AS uuid),
                          CAST(:variant_id AS uuid),
                          CAST('DECREASE_SALE' AS stock_movement_type),
                          :qty_delta,
                          :reason,
                          CAST(:sale_id AS uuid),
                          CAST(:user_id AS uuid)
                        )
                        """
                    ),
                    {
                        "warehouse_id": warehouse_id,
                        "batch_id": batch["batch_id"],
                        "variant_id": item["variant_id"],
                        "qty_delta": -take,
                        "reason": "Sale checkout",
                        "sale_id": sale["id"],
                        "user_id": user["id"],
                    },
                )

                remaining -= take

            if remaining > 0:
                raise HTTPException(status_code=400, detail=f"Stock race detected for {item['name']}")

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Checkout failed: {exc}")

    return CheckoutResponse(
        sale_id=sale["id"],
        ticket_number=sale["ticket_number"],
        subtotal=float(subtotal),
        total=float(subtotal),
        currency="USD",
    )
