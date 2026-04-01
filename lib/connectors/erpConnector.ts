/**
 * ERP Connector Stub
 *
 * This module provides a thin abstraction for communicating with ERP systems
 * (e.g., Oracle NetSuite, SAP). For now these functions are stubs returning
 * mocked success responses. Replace implementations with real HTTP/SDK calls
 * and secure credentials via environment variables when integrating.
 */

export async function pushOrderToErp(order: { orderNumber: string; productSku: string; quantity: number }) {
    // TODO: Implement actual connector using REST/SOAP/SDK for the target ERP.
    console.info('erpConnector.pushOrderToErp: stub called', order);
    return { success: true, externalId: `ERP-${Date.now()}` };
}

export async function getErpOrderStatus(externalId: string) {
    // Mocked status response
    return { status: 'ACKED', externalId };
}

export default { pushOrderToErp, getErpOrderStatus };
