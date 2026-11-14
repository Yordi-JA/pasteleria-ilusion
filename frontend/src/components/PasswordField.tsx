import { useState } from 'react'
import type { ComponentProps } from 'react'
import TextField from './TextField.tsx'
import { focusRing } from './focus.ts'

type PasswordFieldProps = Omit<ComponentProps<typeof TextField>, 'type' | 'trailing'>

/**
 * Campo de contraseña con "Mostrar" (Login.dc.html): el botón cambia el campo a texto y pasa a "Ocultar". Su nombre
 * accesible es la acción completa y empieza con el texto visible ("Mostrar contraseña", "Ocultar contraseña").
 */
export default function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      // Que el teclado del teléfono no corrija ni ponga mayúsculas a la contraseña.
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          onClick={() => setVisible((current) => !current)}
          className={`h-11 cursor-pointer rounded-sm px-3.5 text-etiqueta text-mermelada hover:underline hover:underline-offset-4 ${focusRing}`}
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      }
    />
  )
}
