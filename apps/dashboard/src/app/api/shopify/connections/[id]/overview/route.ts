import { NextRequest, NextResponse } from "next/server";
import {
  getConnectionForWorkspace,
  getShopifyOverview,
} from "@/lib/shopify/repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";

export const runtime = "nodejs";

function shopDateKey(timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function addCalendarDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/shopify/connections/[id]/overview">,
) {
  try {
    const workspaceId = (await requireWorkspaceAccess("viewer")).workspaceId;
    const id = (await context.params).id;
    const connection = await getConnectionForWorkspace(id, workspaceId);
    if (!connection) {
      return NextResponse.json(
        { error: "Shopify connection not found." },
        { status: 404 },
      );
    }

    const overview = await getShopifyOverview(id, workspaceId);
    if (!overview) {
      return NextResponse.json(
        { error: "Shopify overview not found." },
        { status: 404 },
      );
    }

    const today = shopDateKey(connection.timezone ?? "UTC");
    const currentStart = addCalendarDays(today, -29);
    const previousStart = addCalendarDays(currentStart, -30);
    const metricByDate = new Map(
      overview.dailyMetrics.map((metric) => [metric.date.slice(0, 10), metric]),
    );
    const daily = Array.from({ length: 30 }, (_, index) => {
      const currentDate = addCalendarDays(currentStart, index);
      const previousDate = addCalendarDays(previousStart, index);
      return {
        date: currentDate,
        currentRevenue: metricByDate.get(currentDate)?.revenue ?? 0,
        currentOrders: metricByDate.get(currentDate)?.ordersCount ?? 0,
        previousRevenue: metricByDate.get(previousDate)?.revenue ?? 0,
        previousOrders: metricByDate.get(previousDate)?.ordersCount ?? 0,
      };
    });

    const currentRevenue = daily.reduce(
      (total, metric) => total + metric.currentRevenue,
      0,
    );
    const previousRevenue = daily.reduce(
      (total, metric) => total + metric.previousRevenue,
      0,
    );
    const currentOrders = daily.reduce(
      (total, metric) => total + metric.currentOrders,
      0,
    );
    const previousOrders = daily.reduce(
      (total, metric) => total + metric.previousOrders,
      0,
    );
    const averageOrderValue =
      currentOrders > 0 ? currentRevenue / currentOrders : 0;
    const previousAverageOrderValue =
      previousOrders > 0 ? previousRevenue / previousOrders : 0;

    return NextResponse.json({
      overview: {
        currencyCode: overview.currencyCode,
        complete: overview.complete,
        lastSyncedAt: overview.lastSyncedAt,
        metrics: {
          revenue: currentRevenue,
          revenueChange: percentageChange(currentRevenue, previousRevenue),
          orders: currentOrders,
          ordersChange: percentageChange(currentOrders, previousOrders),
          averageOrderValue,
          averageOrderValueChange: percentageChange(
            averageOrderValue,
            previousAverageOrderValue,
          ),
          products: overview.productsCount,
          inventoryUnits: overview.inventoryUnits,
        },
        daily,
        series: overview.dailyMetrics.map((metric) => ({
          date: metric.date.slice(0, 10),
          revenue: metric.revenue,
          ordersCount: metric.ordersCount,
        })),
        products: overview.products,
      },
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to load store overview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
