# Principios de producto de Faro

Esta es la ley conceptual de Faro. Todo lo que se construya y todo texto de la app (landing, ayuda, mails y el comportamiento del Vigía) tiene que respetarla. Si un pedido la contradice, se avisa antes de implementarlo.

Acordado en octubre de 2026.

---

## 1. Principio madre

> **Faro ayuda a hacer y a ordenar, pero nunca dice que está bien.**

- Faro ejecuta **hechos**: factura, registra, muestra el semáforo del monotributo y avisa de los vencimientos.
- Faro **nunca** valida, asesora ni garantiza que la situación fiscal de alguien esté sana o en regla.
- La frase **"esto no reemplaza el criterio de un contador"** es la columna vertebral del producto, no letra chica legal. Tiene que estar presente donde corresponde, con naturalidad.
- El Vigía nunca presenta algo como una verdad validada. Siempre deja claro que muestra datos o borradores, no una validación profesional. Ejemplo: "Según lo que cargaste, facturaste el 82 % del tope de tu categoría", nunca "Estás bien con el monotributo".

## 2. Dos modos de responsabilidad (el corazón del negocio)

| Modo | Quién | De quién es la responsabilidad |
|---|---|---|
| **Autogestión** | La persona o el autónomo solos | Del usuario. Faro lo ordena y le deja hacer lo básico, pero no da fe de nada. |
| **Gestión profesional** | Hay un contador o estudio conectado | La responsabilidad profesional pasa al contador. Recién ahí el usuario puede desentenderse de verdad. |

- El contador es **el único que puede dar fe**. Faro nunca le pisa ese lugar: se lo reserva.
- El salto de un modo al otro es el corazón del negocio y el principal argumento de venta hacia los dos lados:
  - A la persona: "ordená solo, y cuando quieras tranquilidad de verdad, sumá un profesional".
  - Al contador: "vos sos el único que puede dar fe; Faro te trae al cliente y te deja ese lugar".
- La app muestra siempre en qué modo está el usuario.

## 3. Faro es la continuidad

- El usuario crece ordenado desde que es una persona común. El día que suma un contador, le entrega su historia completa, limpia y lista para trabajar.
- El contador no recibe "el cliente que le sacaron", sino un cliente ya ordenado, y se ahorra la peor parte del trabajo: ordenar el pasado.
- Faro no le roba clientes al contador: **se los prepara y se los trae** por la Red de estudios.

## 4. El dato es del usuario (conexión, no copia)

- **Conexión, no copia.** El contador no se lleva una copia a su panel: se conecta a la cuenta del usuario y trabaja sobre su información en tiempo real. Es un acceso por permiso, como una llave.
- **Revocable.** Cuando la relación termina, el dato queda intacto en la cuenta del usuario, donde siempre estuvo.
- **Estándar común.** Cualquier estudio en Faro recibe la información en el mismo formato. Cambiar de contador deja de ser una mudanza traumática, y eso ya es un motivo para estar en Faro.
- **Granular.** El usuario elige qué comparte: lo fiscal, siempre; lo personal, solo si quiere.

## 5. Lo personal y lo fiscal

- Las finanzas personales (la cena, el gimnasio, el súper) son del usuario y **no se reportan a ningún contador**.
- Al contador le interesa la **actividad**: lo facturado, los gastos del trabajo y lo deducible.
- El único cruce entre los dos mundos es cuando el usuario **marca un gasto como "de mi actividad"** (deducible). Ahí pasa de lo personal a lo fiscal y el contador lo ve. Ya está implementado en parte: Bitácora → marcar como deducible → Faro Personal.

## 6. Cómo trabaja el contador conectado: delegar, no gestionar

- El usuario contrata a un contador para desentenderse, no para aprobar cada cosa. **Por defecto, el contador tiene potestad para operar** y el usuario **monitorea**: no confirma.
- **Transparencia total ("confianza con puerta de vidrio").** Todo lo que el contador hace aparece en el panel del usuario, al día y visible cuando quiera, sin que tenga que tocar nada.
- **Perilla configurable** al iniciar la relación (y modificable después):
  - **Delegar y mirar** (por defecto): el contador opera y el usuario ve todo.
  - **Proponer y aprobar**: el contador prepara y el usuario aprueba cada movimiento, como con el Vigía.
- El usuario tiene siempre la última palabra sobre cuánta autonomía le da al contador.

## 7. Admisión: conectarse es un acuerdo, no un clic

- Cualquiera de las dos partes puede iniciar la conexión: el usuario busca un estudio en la Red y lo solicita, o el estudio lo invita.
- Antes de aceptar a un cliente, el estudio hace su **admisión**: revisa la información, hace una entrevista o el análisis que necesite.
- Recién después firman el acuerdo, aceptan las políticas y empiezan a trabajar.
- La conexión solo existe con el **sí de las dos partes**.

## 8. Desconexión con mediación (no un portazo)

- El fin de la relación es un **cierre ordenado**:
  1. Se inicia la finalización.
  2. Se deja constancia de que nadie le debe nada a nadie.
  3. Las dos partes están de acuerdo.
  4. Recién ahí termina.
- Queda un registro para los dos de que estuvieron conectados y durante qué período.
- Al cerrarse, el contador pierde el acceso y no se lleva copias.

## 9. Calificaciones en dos momentos

- **Durante la relación:** si el usuario está conforme, no debería tener que esperar a irse para decirlo.
- **Al finalizar:** una calificación de cierre.
- **Pendiente de definición:** cuánto de esto se expone públicamente como reputación del estudio (ver "Decisiones abiertas").

---

## Decisiones abiertas

- **(a) Exposición pública de las calificaciones.** Falta definir cuánto de las calificaciones (durante la relación y al cierre) se muestra públicamente como reputación del estudio en la Red. Hay que equilibrar el poder del cliente con no espantar a los estudios de la Red. No se implementa ningún cambio sobre esto hasta decidirlo.

El resto de los puntos de este documento quedaron cerrados.
