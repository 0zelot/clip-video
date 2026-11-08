/**
 * Builds the Android debug APK: copies the web build into the Capacitor
 * project and runs Gradle. Works on Windows, macOS and Linux.
 * Needs the Android SDK (Android Studio) - ANDROID_HOME or android/local.properties.
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
if (!existsSync(join(root, '.output/public/index.html'))) {
  console.error('No web build found in .output/public - run "npm run build" first.')
  process.exit(1)
}
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' })
run('npx cap sync android')
run(process.platform === 'win32' ? 'gradlew.bat assembleDebug' : './gradlew assembleDebug', join(root, 'android'))
console.log('\nAPK: android/app/build/outputs/apk/debug/app-debug.apk')
