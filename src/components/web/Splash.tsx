import { Sello } from "@/components/admin/kit/Sello";

// Intro del sitio: pantalla azul plena con el sello que se arma trazo por trazo,
// el nombre y la bajada; después se abre en dos hojas y aparece la web. Una vez
// por sesión, sin JS de React (todo CSS + este script) y salteable con un clic o
// una tecla. Con reduced-motion no se muestra.
const script = `!function(){var d=document.documentElement;try{if(matchMedia('(prefers-reduced-motion: reduce)').matches||sessionStorage.getItem('splash-visto')){d.classList.add('no-splash');return}sessionStorage.setItem('splash-visto','1')}catch(e){d.classList.add('no-splash');return}d.classList.add('splash-on');var done=0;function exit(){if(done)return;done=1;d.classList.add('splash-exit');d.classList.remove('splash-on');setTimeout(function(){d.classList.add('no-splash')},1600)}setTimeout(exit,3000);addEventListener('keydown',exit,{once:true});addEventListener('pointerdown',exit,{once:true})}()`;

export function Splash() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: script }} />
      <div className="splash" aria-hidden>
        <span className="splash-leaf splash-leaf-top" />
        <span className="splash-leaf splash-leaf-bottom" />
        <span className="splash-glow" />
        <span className="splash-seam" />
        <div className="splash-content">
          <div className="splash-seal">
            <svg viewBox="0 0 100 100" className="splash-orbit">
              <circle cx="50" cy="50" r="48" />
            </svg>
            <Sello animated className="size-full text-rose-light" title="" />
          </div>
          <p className="splash-title">
            {["Estudio", "Cristofaro", "&", "Asociados"].map((w, i) => (
              <span key={w} className="splash-word">
                <span style={{ "--w": i } as React.CSSProperties}>{w}</span>
              </span>
            ))}
          </p>
          <span className="splash-rule" />
          <p className="splash-sub">Contabilidad de nivel empresarial</p>
        </div>
      </div>
    </>
  );
}
