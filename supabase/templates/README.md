# Correos de acceso de Plan-OTs

Asunto de invitación: `Tu acceso a Plan-OTs`.

Asunto de recuperación: `Elegí tu contraseña de Plan-OTs`.

Estas plantillas se cargan en Supabase Auth > Emails > Templates del proyecto `iqgbyqyoovzvhhdjawnt`. El enlace debe conservar literalmente `{{ .ConfirmationURL }}`. La versión anterior de invitación era el asunto `You have been invited` y este cuerpo:

```html
<h2>You have been invited</h2>

<p>You have been invited to create a user on {{ .SiteURL }}. Follow this link to accept the invite:</p>
<p><a href="{{ .ConfirmationURL }}">Accept the invite</a></p>
```

La versión anterior de recuperación era el asunto `Reset Your Password` y este cuerpo:

```html
<h2>Reset Password</h2>

<p>Follow this link to reset the password for your user:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
```

Para revertir, restaurar los asuntos y cuerpos anteriores en el panel.
