from pydantic import BaseModel, Field


class SaleItemInput(BaseModel):
    code: str
    qty: int = Field(gt=0)


class CheckoutRequest(BaseModel):
    customer_name: str | None = None
    customer_phone: str | None = None
    items: list[SaleItemInput]


class CheckoutResponse(BaseModel):
    sale_id: str
    ticket_number: int
    subtotal: float
    total: float
    currency: str


class DashboardSummary(BaseModel):
    invested_amount: float
    gross_sales: float
    cost_of_goods_sold: float
    profit: float
