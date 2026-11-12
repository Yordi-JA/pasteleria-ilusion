/**
 * Las imágenes de un pastel diseñado que ya está en el carrito: la de "Otra decoración" y la de la oblea (D55). Una
 * imagen de hasta 5 MB no cabe en `localStorage` ni en `sessionStorage` (unos 5 MB por origen, y el texto pesa un tercio
 * más que el archivo), así que se guarda el archivo en `IndexedDB` y en la línea del carrito solo va su clave. Sigue siendo
 * solo del navegador, hasta que la Etapa 4 la suba con el pedido.
 *
 * Todo va en `try/catch`: con el navegador en modo privado, sin espacio o con `IndexedDB` bloqueado, guardar devuelve `null`
 * y el carrito sigue con el pastel, que avisa que hay que elegir la imagen otra vez. Nunca lanza.
 */

const DATABASE = 'ilusion.designImages'
const STORE = 'images'
const VERSION = 1

/** Lo que se guarda de cada imagen: el archivo y el nombre limpio con el que se mostró. */
export type StoredImage = { blob: Blob; name: string }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('IndexedDB bloqueada'))
  })
}

/** Corre una operación sobre el almacén y espera a que la transacción termine bien. */
async function run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const database = await open()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode)
      const request = operation(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(request ? request.result : undefined)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

/** Guarda la imagen y devuelve su clave, o `null` si el navegador no la pudo guardar. */
export async function saveDesignImage(image: StoredImage): Promise<string | null> {
  try {
    const key = crypto.randomUUID()
    await run('readwrite', (store) => store.put(image, key))
    return key
  } catch (error) {
    console.warn('No se pudo guardar la imagen del pastel en este navegador.', error)
    return null
  }
}

/** La imagen guardada con esa clave, o `null` si no está o no se pudo leer. */
export async function readDesignImage(key: string): Promise<StoredImage | null> {
  try {
    const found = await run<unknown>('readonly', (store) => store.get(key))
    const record = found as Partial<StoredImage> | undefined
    return record && record.blob instanceof Blob && typeof record.name === 'string' ? { blob: record.blob, name: record.name } : null
  } catch (error) {
    console.warn('No se pudo leer la imagen del pastel.', error)
    return null
  }
}

/** Borra las imágenes de esas claves (al quitar el pastel del carrito). Una que no se pudo borrar no detiene lo demás. */
export async function deleteDesignImages(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  try {
    await run('readwrite', (store) => {
      for (const key of keys) store.delete(key)
    })
  } catch (error) {
    console.warn('No se pudieron borrar las imágenes del pastel quitado.', error)
  }
}
