# Shopify

E-commerce platform for online stores and retail.

## Capabilities

| Integration | Available | Notes |
|-------------|-----------|-------|
| API | ✓ | REST Admin API, Storefront API, GraphQL |
| MCP | - | Not available |
| CLI | ✓ | Shopify CLI for themes and apps |
| SDK | ✓ | Official libraries for multiple languages |

## Authentication

- **Type**: Access Token (Custom App or OAuth)
- **Header**: `X-Shopify-Access-Token: {access_token}`
- **Base URL**: `https://{shop}.myshopify.com/admin/api/2024-01/`

## Common Agent Operations

### Get shop info

```bash
GET https://{shop}.myshopify.com/admin/api/2024-01/shop.json

X-Shopify-Access-Token: {access_token}
```

### List products

```bash
GET https://{shop}.myshopify.com/admin/api/2024-01/products.json?limit=50

X-Shopify-Access-Token: {access_token}
```

### Get product

```bash
GET https://{shop}.myshopify.com/admin/api/2024-01/products/{product_id}.json

X-Shopify-Access-Token: {access_token}
```

### Create product

```bash
POST https://{shop}.myshopify.com/admin/api/2024-01/products.json

X-Shopify-Access-Token: {access_token}

{
  "product": {
    "title": "Product Name",
    "body_html": "<p>Description</p>",
    "vendor": "Brand",
    "product_type": "Category",
    "variants": [{
      "price": "99.00",
      "sku": "SKU-001"
    }]
  }
}
```

### List orders

```bash
GET https://{shop}.myshopify.com/admin/api/2024-01/orders.json?status=any&limit=50

X-Shopify-Access-Token: {access_token}
```

### Get order

```bash
GET https://{shop}.myshopify.com/admin/api/2024-01/orders/{order_id}.json

X-Shopify-Access-Token: {access_token}
```

### List customers

```bash
GET https://{shop}.myshopify.com/admin/api/2024-01/customers.json?limit=50

X-Shopify-Access-Token: {access_token}
```

### Search customers

```bash
GET https://{shop}.myshopify.com/admin/api/2024-01/customers/search.json?query=email:user@example.com

X-Shopify-Access-Token: {access_token}
```

### Get analytics

Store totals, trends, and period comparisons belong in ShopifyQL, run through the Admin GraphQL `shopifyqlQuery` field. This needs the `read_reports` scope. REST `reports.json` does not return these aggregates.

The commerce dashboard uses this query for the 60-day net sales chart (current 30 days plus the previous 30, in the shop timezone):

```shopifyql
FROM sales
SHOW net_sales, orders
TIMESERIES day
SINCE startOfDay(-59d)
UNTIL today
ORDER BY day ASC
```

```graphql
query {
  shopifyqlQuery(query: """
    FROM sales
    SHOW net_sales, orders
    TIMESERIES day
    SINCE startOfDay(-59d)
    UNTIL today
    ORDER BY day ASC
  """) {
    tableData {
      columns { name dataType }
      rows
    }
    parseErrors
  }
}
```

Field names and the `startOfDay(-59d)` / `UNTIL today` window are from the [ShopifyQL 2026-07 sales schema](https://shopify.dev/docs/api/shopifyql/2026-07) and [SINCE, UNTIL, DURING](https://shopify.dev/docs/api/shopifyql/2026-07/syntax/since-until-during). Check `parseErrors` before reading `tableData`. A missing `read_reports` scope returns an `ACCESS_DENIED` GraphQL error.

## GraphQL API

```graphql
{
  products(first: 10) {
    edges {
      node {
        id
        title
        totalInventory
        priceRangeV2 {
          minVariantPrice {
            amount
          }
        }
      }
    }
  }
}
```

## CLI Commands

```bash
# Login
shopify login --store={shop}

# Create theme
shopify theme init

# Push theme
shopify theme push

# Preview theme
shopify theme dev

# Create app
shopify app create node
```

## Webhook Topics

| Topic | When |
|-------|------|
| `orders/create` | New order |
| `orders/paid` | Order paid |
| `orders/fulfilled` | Order shipped |
| `customers/create` | New customer |
| `products/update` | Product changed |
| `checkouts/create` | Checkout started |

## When to Use

- E-commerce store management
- Product catalog operations
- Order processing
- Customer data management
- Inventory tracking

## Rate Limits

- REST: 2 requests/second
- GraphQL: 50 points/second
- Bulk operations available

## Relevant Skills

- analytics-tracking
- email-sequence
- referral-program
