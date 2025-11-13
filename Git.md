# Comandos de Git

---

## Configuración Inicial
----------------
* `git config --global user.name "Tu Nombre"`
* `git config --global user.email "tu email@example.com"`

Esto es importante para configurar tu identidad en los commits. El correo electrónico debe 
coincidir con el de tu cuenta de GitHub si planeas subir tus repositorios allí.

### Para traer nuestro repositorio remoto a local 
* `git clone <url-del-repositorio>`
* `git clone https://github.com/Byfa96/visita-segura.git`

## Comandos Básicos de Git orientado a Github Flow

`git status`

Muestra el estado de los archivos en el directorio de trabajo y el área de preparación

`git pull origin <rama>`
Trae y fusiona los cambios del repositorio remoto a tu rama local. *IMPORTANTE: Siempre haz un pull antes de hacer un push para evitar conflictos.*

`git add <archivo>` o `git add .` Usualmente con un .gitignore bien configurado solo se usa `git add .`

`git reset <archivo>` o `git reset .` para deshacer cambios en el área de preparación. Tipo en caso de que hayas hecho `git add` y no quieras incluir esos archivos en el próximo commit.

`git commit -m "Mensaje del commit"`
Guarda los cambios en el repositorio local con un mensaje descriptivo

`git branch` 
Muestra las ramas existentes en tu repositorio local y **resalta la rama actual.**

`git checkout <nombre-de-la-rama>`
Cambia a la rama especificada.

`git checkout -b <nombre-de-la-rama>`
Crea una nueva rama y cambia a ella. Es 2 comandos en uno.

`git branch -d <nombre-de-la-rama>`
Elimina la rama especificada. 

`git push origin <rama>`
Esto sube tus cambios al repositorio remoto en la rama especificada.

`git merge <nombre-de-la-rama>`
Fusiona la rama especificada en la rama actual. No lo vamos a usar ya que usaremos pull request en GitHub.

Por ahora estos usaremos, quizás hayan más comandos pero estos son los básicos y los que más se usan.

Ahora un ejemplo de flujo de trabajo típico en nuestro repositorio:

Lo primero es hacer un `git pull origin main` para asegurarnos de tener la última versión del repositorio remoto. Usualmente nos situamos en la rama main para hacer el pull.

Luego, creamos una nueva rama para trabajar en una nueva característica o corrección de errores:

`git checkout -b <nombre-de-la-rama>`

Hacemos nuestros cambios y los añadimos al área de preparación:

`git add <archivo>` o `git add .`

Luego, hacemos un commit de nuestros cambios:

`git commit -m "Descripción de los cambios"`

Finalmente, subimos nuestra rama al repositorio remoto:

`git push origin <nombre-de-la-rama>`

Y creamos un pull request en GitHub para que nuestros cambios sean revisados e integrados en la rama main.

Comando extra útil:

`git stash`
Guarda temporalmente los cambios no confirmados para que puedas cambiar de rama sin perder tu trabajo. Luego puedes recuperarlos con `git stash pop`. No lo usen si no estan seguros de como funciona XD

Digamos que estamos trabajando en una nueva característica llamada "Actualización de la interfaz de usuario". El flujo de trabajo sería:
1. `git pull origin main` SIEMPRE ANTES DE EMPEZAR
2. `git checkout -b feature/actualizacion-ui`
3. Hacemos cambios en los archivos.
4. `git add .`
5. `git commit -m "Mejora la interfaz de usuario con nuevos estilos"`
6. `git push origin feature/actualizacion-ui`
7. Ir a la web de GitHub y crear un pull request.
8. Borrar la rama local con `git branch -d feature/actualizacion-ui` y la remota desde GitHub.
9. Volver a la rama main con `git checkout main` y hacer otro `git pull origin main` para asegurarnos de tener la última versión si el pull request ya fue aceptado.


Eso sería por ahora.



# Crear certificados SSL autofirmados para desarrollo local
----------------

- Crear archivos pem con mkcert y meterlos en la carpeta certs/

Flujo:
- Instalar mkcert:
    - Windows: choco install mkcert

mkcert -install
mkcert ip user localhost


- Cambiar nombres de los archivos .pem dentro de app.js.