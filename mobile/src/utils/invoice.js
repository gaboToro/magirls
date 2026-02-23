import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

function currency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export async function generateAndShareInvoice({ sale, customerName, items, total }) {
  const date = new Date().toLocaleString();
  const rows = items
    .map(
      (item) => `
        <tr>
          <td>${item.productName}</td>
          <td>${item.qty}</td>
          <td>${currency(item.salePrice)}</td>
          <td>${currency(item.qty * item.salePrice)}</td>
        </tr>
      `
    )
    .join("");

  const html = `
    <html>
      <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h1>Factura Ma' Girls</h1>
        <p><strong>Ticket:</strong> ${sale.ticket_number}</p>
        <p><strong>Fecha:</strong> ${date}</p>
        <p><strong>Cliente:</strong> ${customerName || "Consumidor final"}</p>
        <table style="width:100%; border-collapse: collapse;" border="1" cellpadding="8">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Precio</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <h2 style="text-align:right; margin-top: 20px;">Total: ${currency(total)}</h2>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Compartir factura"
    });
  }

  return uri;
}
