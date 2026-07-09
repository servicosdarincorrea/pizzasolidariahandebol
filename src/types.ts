export interface PizzaItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: "SALGADA" ;
  badge?: string;
  image: string;
}

export interface CartItem {
  pizza: PizzaItem;
  quantity: number;
}

export interface OrderFormData {
  customerName: string;
  cpf?: string;
  studentTurma: string;
  email: string;
  studentName: string;
  whatsapp: string;
  paymentMethod: "PIX" | "CARTAO";
  cardData?: {
    cardNumber: string;
    cardHolder: string;
    expiryDate: string;
    cvv?: string;
    installments: string;
    cardType?: "CREDITO" | "DEBITO";
  };
}

export interface Order {
  id: string;
  items: {
    name: string;
    quantity: number;
    price: number;
    category?: string;
  }[];
  total: number;
  customerName: string;
  cpf?: string;
  studentTurma: string;
  studentName: string;
  email: string;
  whatsapp: string;
  paymentMethod: "PIX" | "CARTAO";
  cardData?: {
    cardNumberMasked: string;
    cardHolder: string;
    installments: string;
    cardType?: "CREDITO" | "DEBITO";
  };
  status: "PAGO" | "AGUARDANDO_PAGAMENTO" | "PROCESSANDO" | "CANCELADO";
  createdAt: string;
  paidAt?: string;
  pickupDate: string;
  mpTransactionId?: string;
  pixCopyPaste?: string;
  qrCodeBase64?: string;
}

export interface IntegrationConfig {
  googleSheetsWebhookUrl: string;
  googleSpreadsheetId: string;
  autoSyncEnabled: boolean;
  mercadoPagoAccessToken: string;
  mercadoPagoPublicKey: string;
  emailNotifySender: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  googleEmail?: string;
  googleAccessToken?: string;
}

export interface RestrictedUser {
  email: string;
  password?: string;
  name: string;
  status: "Ativo" | "Inativo";
}

