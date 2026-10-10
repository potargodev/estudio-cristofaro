import { Sello } from "@/components/admin/kit/Sello";

// Intro del sitio: pantalla azul plena con el sello que se arma trazo por trazo,
// el nombre y la bajada; después se abre en dos hojas y aparece la web. Una vez
// por sesión, sin JS de React (todo CSS + este script) y salteable con un clic o
// una tecla. Con reduced-motion no se muestra.
const script = `!function(){var d=document.documentElement;try{if(matchMedia('(prefers-reduced-motion: reduce)').matches||sessionStorage.getItem('splash-visto')){d.classList.add('no-splash');return}sessionStorage.setItem('splash-visto','1')}catch(e){d.classList.add('no-splash');return}d.classList.add('splash-on');var done=0;function exit(){if(done)return;done=1;try{var s=document.querySelector('.splash-seal'),el=document.querySelector('.splash');if(s&&el){var r=s.getBoundingClientRect();el.style.setProperty('--cx',r.left+r.width/2+'px');el.style.setProperty('--cy',r.top+r.height/2+'px')}}catch(e){}d.classList.add('splash-exit');d.classList.remove('splash-on');setTimeout(function(){d.classList.add('no-splash')},1400)}setTimeout(exit,2500);addEventListener('keydown',exit,{once:true});addEventListener('pointerdown',exit,{once:true})}()`;

export function Splash() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: script }} />
      <div className="splash" aria-hidden>
        <span className="splash-veil" />
        <span className="splash-ring" />
        <div className="splash-content">
          <div className="splash-seal">
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
