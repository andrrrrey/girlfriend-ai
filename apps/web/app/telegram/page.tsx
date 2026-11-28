import { redirect } from "next/navigation";

/** Telegram переехал в «Настройки» — старые ссылки ведут туда. */
export default function TelegramRedirect() {
  redirect("/settings#telegram");
}
