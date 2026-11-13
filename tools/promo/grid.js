// Grid overlay for picking zoom targets by eye: node tools/promo/grid.js <out.png> <shotId...>
// Draws a 0.1 grid with labels (columns 0.1-0.9 across the top, rows down the left) on each still and tiles them 2 per row.
// Read a target as (x, y) in the 0..1 coordinates scenes.js uses.
const { spawnSync } = require('child_process')
const path = require('path')
const [out, ...ids] = process.argv.slice(2)
const font = 'C\\:/Windows/Fonts/arial.ttf'
const W = 960, H = 516
const args = ['-y', '-v', 'error']
ids.forEach(id => args.push('-i', path.join(__dirname, 'shots', id + '.png')))
const grid = []
for (let k = 1; k <= 9; k++) {
  grid.push(`drawbox=x=${Math.round(W * k / 10)}:y=0:w=1:h=${H}:color=${k === 5 ? 'white@0.8' : 'cyan@0.45'}:t=fill`)
  grid.push(`drawbox=x=0:y=${Math.round(H * k / 10)}:w=${W}:h=1:color=${k === 5 ? 'white@0.8' : 'cyan@0.45'}:t=fill`)
  grid.push(`drawtext=fontfile='${font}':text='.${k}':x=${Math.round(W * k / 10) + 2}:y=2:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.6`)
  grid.push(`drawtext=fontfile='${font}':text='.${k}':x=2:y=${Math.round(H * k / 10) + 2}:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.6`)
}
const c = 2, rows = Math.ceil(ids.length / c)
const parts = ids.map((id, i) => `[${i}:v]scale=${W}:${H},${grid.join(',')},drawtext=fontfile='${font}':text='${id}':x=${W - 260}:y=${H - 26}:fontsize=20:fontcolor=lime:box=1:boxcolor=black@0.7[g${i}]`).join(';')
const stack = ids.map((_, i) => `[g${i}]`).join('') + `xstack=inputs=${ids.length}:layout=${ids.map((_, i) => `${(i % c) * W}_${Math.floor(i / c) * H}`).join('|')}[o]`
const r = spawnSync(require('ffmpeg-static'), [...args, '-filter_complex', parts + ';' + stack, '-map', '[o]', '-frames:v', '1', out], { encoding: 'utf8' })
if (r.status) { console.error(r.stderr.slice(-800)); process.exit(1) }
console.log('wrote', out)
