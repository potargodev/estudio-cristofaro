"use server";

import { getCurrentUser } from "@/lib/auth";
import { setPrefs } from "@/lib/prefs";

/** Barra lateral expandida o colapsada (barra horizontal), guardada por usuario */
export async function setSidebarPref(collapsed: boolean) {
  const me = await getCurrentUser();
  if (!me) return;
  await setPrefs(me.id, { sidebar: collapsed === true ? "collapsed" : "expanded" });
}

export async function setHideFirstStepsPref(hide: boolean) {
  const me = await getCurrentUser();
  if (!me) return;
  await setPrefs(me.id, { hideFirstSteps: hide === true });
}

export async function setCopilotAutoPref(on: boolean) {
  const me = await getCurrentUser();
  if (!me) return;
  await setPrefs(me.id, { copilotAuto: on === true });
}
