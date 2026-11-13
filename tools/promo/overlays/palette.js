openCmdPalette(); const i = document.getElementById('cmd-input'); i.value = 'nykii'; i.dispatchEvent(new Event('input', { bubbles: true })); 'palette'
