# Convertidor_temperatura

PWA para convertir entre Celsius, Fahrenheit y Kelvin. Funciona sin conexión, con sincronización en segundo plano, distintivo en el icono y notificaciones.

## Notificaciones push desde Vercel

Las funciones de `api/` envían los push (`api/clave.js` entrega la clave pública y `api/enviar.js` firma y envía el mensaje a la suscripción del dispositivo). No se guarda nada en el servidor.

1. Genera las claves VAPID (una sola vez):

   ```powershell
   npx web-push generate-vapid-keys
   ```

2. En Vercel (Project → Settings → Environment Variables) crea estas tres variables en Production, y vuelve a desplegar:

   | Variable | Valor |
   |---|---|
   | `VAPID_PUBLIC_KEY` | la clave pública generada |
   | `VAPID_PRIVATE_KEY` | la clave privada generada (secreta: no la subas al repositorio) |
   | `VAPID_SUBJECT` | `mailto:tu-correo@ejemplo.com` |

3. Reinstala la app desde Edge, pulsa "Activar notificaciones" y después "Enviar push de prueba".

Si las variables no existen, el botón de push no aparece y la app funciona igual.
