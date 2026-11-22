import PDFDocument from 'pdfkit';

export interface ReceiptSnapshot {
  id: string;
  estado: 'REGISTRADO' | 'ANULADO';
  motivoAnulacion: string | null;
  numeroComprobante: string;
  juntaNombre: string;
  juntaRuc: string | null;
  socioNombre: string;
  concepto: string;
  fecha: string;
  metodo: string;
  monto: string;
  creadoEn: Date;
}

export function receiptPdf(snapshot: ReceiptSnapshot) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({
      size: 'A4',
      margin: 60,
      info: {
        Title: `Comprobante interno ${snapshot.numeroComprobante}`,
        Subject: snapshot.estado,
        CreationDate: snapshot.creadoEn,
      },
    });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    document
      .font('Helvetica-Bold')
      .fontSize(24)
      .text('Comprobante interno de pago');
    document
      .moveDown(0.5)
      .font('Helvetica')
      .fontSize(14)
      .text(snapshot.juntaNombre);
    if (snapshot.juntaRuc)
      document.fontSize(11).text(`RUC ${snapshot.juntaRuc}`);
    document
      .moveDown()
      .fontSize(12)
      .text(`Número ${snapshot.numeroComprobante}`);
    document.text(`Fecha de pago ${snapshot.fecha}`);
    document
      .fontSize(10)
      .text(`Referencia del pago ${snapshot.id}`)
      .fontSize(12);
    document.moveDown().text(`Socio: ${snapshot.socioNombre}`);
    document.text(`Concepto: ${snapshot.concepto}`);
    document.text(`Método de pago: ${snapshot.metodo}`);
    document
      .moveDown()
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(`USD ${snapshot.monto}`);
    if (snapshot.estado === 'ANULADO') {
      document.moveDown().fillColor('#982b2b').fontSize(14).text('Anulado');
      if (snapshot.motivoAnulacion)
        document.font('Helvetica').fontSize(11).text(snapshot.motivoAnulacion);
    }
    document
      .moveDown()
      .fillColor('#444444')
      .font('Helvetica')
      .fontSize(10)
      .text('Documento interno de gestión comunitaria');
    document.end();
  });
}
