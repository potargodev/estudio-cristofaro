// Script en línea (antes de pintar): marca si hay movimiento permitido para que
// los titulares con máscara arranquen ocultos sin parpadeo. Si el JS tarda más
// de 3 s, todo se muestra igual (motion-timeout).
export function MotionBoot() {
  const code = `!function(){try{var d=document.documentElement;if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;d.classList.add('js-motion');window.__motionTimer=setTimeout(function(){d.classList.add('motion-timeout')},3000)}catch(e){}}()`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

/** Corta el resguardo de 3 s (lo llama la primera animación que arranca) */
export function cancelMotionTimeout() {
  const w = window as unknown as { __motionTimer?: number };
  if (w.__motionTimer) window.clearTimeout(w.__motionTimer);
  w.__motionTimer = undefined;
}
