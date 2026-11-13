// Contact sheet for eyeballing many stills at once: node tools/promo/sheet.js <out.png> <cols> <thumbWidth> <file...>
// Prints the files in tile order (left to right, top to bottom). Uses ffmpeg-static; no other dependency.
const { spawnSync } = require('child_process')
const [out, cols, tw, ...files] = process.argv.slice(2)
const n = files.length, c = +cols, rows = Math.ceil(n / c), th = Math.round(+tw * 0.625)
const args = ['-y', '-v', 'error']
files.forEach(f => args.push('-i', f))
const scale = files.map((_, i) => `[${i}:v]scale=${tw}:${th}:force_original_aspect_ratio=decrease,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:color=0x202020[s${i}]`).join(';')
const stack = files.map((_, i) => `[s${i}]`).join('') + `xstack=inputs=${n}:layout=${files.map((_, i) => `${(i % c) * tw}_${Math.floor(i / c) * th}`).join('|')}[o]`
args.push('-filter_complex', scale + ';' + stack, '-map', '[o]', '-frames:v', '1', out)
const r = spawnSync(require('ffmpeg-static'), args, { encoding: 'utf8' })
if (r.status) { console.error(r.stderr.slice(-600)); process.exit(1) }
files.forEach((f, i) => console.log(`${Math.floor(i / c) + 1}.${(i % c) + 1}  ${f.split(/[\\/]/).slice(-3).join('/')}`))
