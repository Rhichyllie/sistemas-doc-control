import type { Document, AppNotification } from "@/contexts/local-data-context";
import { docStatusLabels } from "@/lib/labels";

export function createNotification(
  type: AppNotification["type"],
  title: string,
  message: string,
  document?: Document
): AppNotification {
  return {
    id: "notif_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11),
    type,
    title,
    message,
    documentId: document?.id,
    documentTitle: document?.title,
    read: false,
    createdAt: new Date().toISOString()
  };
}

export function checkForNotifications(documents: Document[], existingNotifications: AppNotification[]): AppNotification[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const oneDayFromNow = new Date(today);
  oneDayFromNow.setDate(today.getDate() + 1);

  const newNotifications: AppNotification[] = [];

  for (const doc of documents) {
    // Verifica prazos de análise
    if (doc.analysisDeadline && !["approved", "rejected", "cancelled"].includes(doc.status)) {
      const deadline = new Date(doc.analysisDeadline);
      deadline.setHours(0, 0, 0, 0);
      
      // Verifica se venceu
      if (today > deadline) {
        const exists = existingNotifications.some(n => 
          n.type === "overdue" && 
          n.documentId === doc.id &&
          new Date(n.createdAt).toDateString() === today.toDateString()
        );
        if (!exists) {
          newNotifications.push(
            createNotification(
              "overdue",
              "Documento Atrasado!",
              `O documento "${doc.title}" venceu em ${doc.analysisDeadline} e ainda não foi analisado.`,
              doc
            )
          );
        }
      }
      // Verifica lembrete de 1 dia antes
      else if (oneDayFromNow.getTime() === deadline.getTime()) {
        const exists = existingNotifications.some(n => 
          n.type === "reminder" && 
          n.documentId === doc.id &&
          new Date(n.createdAt).toDateString() === today.toDateString()
        );
        if (!exists) {
          newNotifications.push(
            createNotification(
              "reminder",
              "Lembrete: Prazo Amanhã!",
              `O documento "${doc.title}" vence amanhã (${doc.analysisDeadline}).`,
              doc
            )
          );
        }
      }
    }

    // Verifica prazos de projetista
    if (doc.projetistaDeadline && ["awaiting_revision", "approved_with_comments", "rejected"].includes(doc.status)) {
      const deadline = new Date(doc.projetistaDeadline);
      deadline.setHours(0, 0, 0, 0);
      
      // Verifica se venceu
      if (today > deadline) {
        const exists = existingNotifications.some(n => 
          n.type === "overdue" && 
          n.documentId === doc.id &&
          new Date(n.createdAt).toDateString() === today.toDateString()
        );
        if (!exists) {
          newNotifications.push(
            createNotification(
              "overdue",
              "Prazo do Projetista Atrasado!",
              `O documento "${doc.title}" deveria ter sido devolvido pelo projetista em ${doc.projetistaDeadline}.`,
              doc
            )
          );
        }
      }
      // Verifica lembrete de 1 dia antes
      else if (oneDayFromNow.getTime() === deadline.getTime()) {
        const exists = existingNotifications.some(n => 
          n.type === "reminder" && 
          n.documentId === doc.id &&
          new Date(n.createdAt).toDateString() === today.toDateString()
        );
        if (!exists) {
          newNotifications.push(
            createNotification(
              "reminder",
              "Lembrete: Prazo do Projetista Amanhã!",
              `O documento "${doc.title}" deve ser devolvido pelo projetista amanhã (${doc.projetistaDeadline}).`,
              doc
            )
          );
        }
      }
    }
  }

  return newNotifications;
}

export function createStatusChangeNotification(
  doc: Document,
  previousStatus: string,
  newStatus: string
): AppNotification {
  return createNotification(
    "status_change",
    "Status do Documento Alterado",
    `O documento "${doc.title}" mudou de status de ${docStatusLabels[previousStatus] || previousStatus} para ${docStatusLabels[newStatus] || newStatus}.`,
    doc
  );
}

// Backward compatibility
export function checkForOverdueDocuments(documents: Document[]): AppNotification[] {
  return checkForNotifications(documents, []);
}

// Funções para notificações push do navegador
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    console.log("Este navegador não suporta notificações desktop");
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

export function sendBrowserNotification(title: string, body: string): void {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, {
      body,
      icon: "/favicon.ico"
    });
  }
}

export function checkForCriticalNotifications(documents: Document[], existingNotifications: AppNotification[]): AppNotification[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const in3Days = new Date(today);
  in3Days.setDate(today.getDate() + 3);

  const newNotifications: AppNotification[] = [];

  for (const doc of documents) {
    const activeStatus = !["approved", "rejected", "cancelled"].includes(doc.status);

    // 1. Vencendo em até 3 dias
    if (doc.analysisDeadline && activeStatus) {
      const deadline = new Date(doc.analysisDeadline);
      deadline.setHours(0, 0, 0, 0);

      if (deadline <= in3Days && deadline >= today) {
        const exists = existingNotifications.some(n =>
          n.type === "reminder" &&
          n.documentId === doc.id &&
          n.message.includes("3 dias") &&
          new Date(n.createdAt).toDateString() === today.toDateString()
        );
        if (!exists) {
          const daysLeft = Math.round((deadline.getTime() - today.getTime()) / 86400000);
          newNotifications.push(createNotification(
            "reminder",
            "⚠️ Prazo Crítico se Aproximando",
            `"${doc.title}" vence em ${daysLeft === 0 ? "hoje" : daysLeft + " dia(s)"}. Ação urgente necessária.`,
            doc
          ));
        }
      }
    }

    // 2. Em análise há mais de 7 dias sem retorno
    if (doc.status === "in_analysis" && doc.receivedAt) {
      const received = new Date(doc.receivedAt);
      const daysSinceReceived = Math.floor((today.getTime() - received.getTime()) / 86400000);

      if (daysSinceReceived > 7) {
        const exists = existingNotifications.some(n =>
          n.type === "overdue" &&
          n.documentId === doc.id &&
          n.message.includes("7 dias") &&
          new Date(n.createdAt).toDateString() === today.toDateString()
        );
        if (!exists) {
          newNotifications.push(createNotification(
            "overdue",
            "🔴 Documento Parado na Análise",
            `"${doc.title}" está em análise há ${daysSinceReceived} dias sem atualização.`,
            doc
          ));
        }
      }
    }

    // 3. Sem responsável definido
    if (activeStatus && !doc.responsibleName) {
      const exists = existingNotifications.some(n =>
        n.type === "info" &&
        n.documentId === doc.id &&
        n.message.includes("sem responsável")
      );
      if (!exists) {
        newNotifications.push(createNotification(
          "info",
          "Documento sem Responsável",
          `"${doc.title}" está ${doc.status === "in_analysis" ? "em análise" : "ativo"} sem responsável definido.`,
          doc
        ));
      }
    }
  }

  return newNotifications;
}
