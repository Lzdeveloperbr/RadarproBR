import { useEffect } from "react";
import { db } from "../lib/db";

/** Avisa (notificação do navegador) sobre tarefas que vencem nos próximos 15 minutos, enquanto o app está aberto. */
export function useTaskReminders() {
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    const KEY = "radar.notified";
    const check = async () => {
      if (Notification.permission !== "granted") return;
      const notified = new Set<string>(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
      const limit = new Date(Date.now() + 15 * 60_000).toISOString();
      const due = await db.lead_tasks.filter((t) => !t.done && !!t.due_at && t.due_at <= limit && !notified.has(t.id)).toArray();
      for (const t of due.slice(0, 5)) {
        const lead = await db.leads.get(t.lead_id);
        const b = lead ? await db.businesses.get(lead.business_id) : undefined;
        new Notification("RADAR LOCAL PRO — tarefa", { body: `${t.title}${b ? ` · ${b.name}` : ""}`, icon: `${import.meta.env.BASE_URL}pwa-192.png`, tag: t.id });
        notified.add(t.id);
      }
      localStorage.setItem(KEY, JSON.stringify([...notified].slice(-500)));
    };
    check();
    const i = setInterval(check, 60_000);
    return () => clearInterval(i);
  }, []);
}
