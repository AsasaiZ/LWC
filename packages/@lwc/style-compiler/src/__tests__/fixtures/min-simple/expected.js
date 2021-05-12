import varResolver from "custom-properties-resolver";
function stylesheet(hostSelector, shadowSelector, nativeShadow) {
  return [(nativeShadow ? [":host(.foo){background: linear-gradient(0deg,", varResolver("--lwc-color"), ",", varResolver("--lwc-other"), ");color: ", varResolver("--piero"), ";}"].join('') : [hostSelector, ".foo{background: linear-gradient(0deg,", varResolver("--lwc-color"), ",", varResolver("--lwc-other"), ");color: ", varResolver("--piero"), ";}"].join('')), (nativeShadow ? ":host{content: \"prost\";}" : [hostSelector, "{content: \"prost\";}"].join('')), (nativeShadow ? [":host p", shadowSelector, " span", shadowSelector, "{color: red;background-color: #0ff;}"].join('') : [hostSelector, " p", shadowSelector, " span", shadowSelector, "{color: red;background-color: #0ff;}"].join(''))].join('');
}
export default [stylesheet];