from pydantic import BaseModel, Field


class ScanUpsertRequest(BaseModel):
    code: str = Field(min_length=1, max_length=200)
    product_name: str = Field(min_length=1, max_length=250)
    brand: str | None = None
    category: str | None = None
    description: str | None = None
    photo_url: str | None = None
    variant_name: str | None = None
    color: str | None = None
    size: str | None = None
    location: str | None = None
    purchase_price: float = 0
    sale_price: float = 0
    initial_qty: int = 0


class StockIncreaseRequest(BaseModel):
    code: str
    qty: int = Field(gt=0)
    reason: str | None = None


class InventoryByCodeResponse(BaseModel):
    code: str
    variant_id: str
    product_name: str
    variant_name: str | None
    sale_price: float
    purchase_price: float
    qty_on_hand: int


class LowStockItem(BaseModel):
    variant_id: str
    product_name: str
    variant_name: str | None
    qty_on_hand: int
    primary_code: str | None


class InventoryListItem(BaseModel):
    variant_id: str
    product_name: str
    variant_name: str | None
    category: str | None
    brand: str | None
    location: str | None
    photo_url: str | None
    sale_price: float
    purchase_price: float
    qty_on_hand: int
    primary_code: str | None


class InventoryUpdateRequest(BaseModel):
    product_name: str | None = None
    brand: str | None = None
    category: str | None = None
    description: str | None = None
    photo_url: str | None = None
    variant_name: str | None = None
    color: str | None = None
    size: str | None = None
    location: str | None = None
    purchase_price: float | None = None
    sale_price: float | None = None
