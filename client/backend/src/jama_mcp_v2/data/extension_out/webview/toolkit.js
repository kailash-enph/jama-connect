"use strict";(()=>{var Se=function(){if(typeof globalThis<"u")return globalThis;if(typeof global<"u")return global;if(typeof self<"u")return self;if(typeof window<"u")return window;try{return new Function("return this")()}catch{return{}}}();Se.trustedTypes===void 0&&(Se.trustedTypes={createPolicy:(o,e)=>e});var Xi={configurable:!1,enumerable:!1,writable:!1};Se.FAST===void 0&&Reflect.defineProperty(Se,"FAST",Object.assign({value:Object.create(null)},Xi));var Xe=Se.FAST;if(Xe.getById===void 0){let o=Object.create(null);Reflect.defineProperty(Xe,"getById",Object.assign({value(e,t){let i=o[e];return i===void 0&&(i=t?o[e]=t():null),i}},Xi))}var te=Object.freeze([]);function jt(){let o=new WeakMap;return function(e){let t=o.get(e);if(t===void 0){let i=Reflect.getPrototypeOf(e);for(;t===void 0&&i!==null;)t=o.get(i),i=Reflect.getPrototypeOf(i);t=t===void 0?[]:t.slice(0),o.set(e,t)}return t}}var So=Se.FAST.getById(1,()=>{let o=[],e=[];function t(){if(e.length)throw e.shift()}function i(s){try{s.call()}catch(a){e.push(a),setTimeout(t,0)}}function r(){let a=0;for(;a<o.length;)if(i(o[a]),a++,a>1024){for(let c=0,d=o.length-a;c<d;c++)o[c]=o[c+a];o.length-=a,a=0}o.length=0}function n(s){o.length<1&&Se.requestAnimationFrame(r),o.push(s)}return Object.freeze({enqueue:n,process:r})}),Yi=Se.trustedTypes.createPolicy("fast-html",{createHTML:o=>o}),To=Yi,St=`fast-${Math.random().toString(36).substring(2,8)}`,Io=`${St}{`,Ut=`}${St}`,v=Object.freeze({supportsAdoptedStyleSheets:Array.isArray(document.adoptedStyleSheets)&&"replace"in CSSStyleSheet.prototype,setHTMLPolicy(o){if(To!==Yi)throw new Error("The HTML policy can only be set once.");To=o},createHTML(o){return To.createHTML(o)},isMarker(o){return o&&o.nodeType===8&&o.data.startsWith(St)},extractDirectiveIndexFromMarker(o){return parseInt(o.data.replace(`${St}:`,""))},createInterpolationPlaceholder(o){return`${Io}${o}${Ut}`},createCustomAttributePlaceholder(o,e){return`${o}="${this.createInterpolationPlaceholder(e)}"`},createBlockPlaceholder(o){return`<!--${St}:${o}-->`},queueUpdate:So.enqueue,processUpdates:So.process,nextUpdate(){return new Promise(So.enqueue)},setAttribute(o,e,t){t==null?o.removeAttribute(e):o.setAttribute(e,t)},setBooleanAttribute(o,e,t){t?o.setAttribute(e,""):o.removeAttribute(e)},removeChildNodes(o){for(let e=o.firstChild;e!==null;e=o.firstChild)o.removeChild(e)},createTemplateWalker(o){return document.createTreeWalker(o,133,null,!1)}});var Fe=class{constructor(e,t){this.sub1=void 0,this.sub2=void 0,this.spillover=void 0,this.source=e,this.sub1=t}has(e){return this.spillover===void 0?this.sub1===e||this.sub2===e:this.spillover.indexOf(e)!==-1}subscribe(e){let t=this.spillover;if(t===void 0){if(this.has(e))return;if(this.sub1===void 0){this.sub1=e;return}if(this.sub2===void 0){this.sub2=e;return}this.spillover=[this.sub1,this.sub2,e],this.sub1=void 0,this.sub2=void 0}else t.indexOf(e)===-1&&t.push(e)}unsubscribe(e){let t=this.spillover;if(t===void 0)this.sub1===e?this.sub1=void 0:this.sub2===e&&(this.sub2=void 0);else{let i=t.indexOf(e);i!==-1&&t.splice(i,1)}}notify(e){let t=this.spillover,i=this.source;if(t===void 0){let r=this.sub1,n=this.sub2;r!==void 0&&r.handleChange(i,e),n!==void 0&&n.handleChange(i,e)}else for(let r=0,n=t.length;r<n;++r)t[r].handleChange(i,e)}},lt=class{constructor(e){this.subscribers={},this.sourceSubscribers=null,this.source=e}notify(e){var t;let i=this.subscribers[e];i!==void 0&&i.notify(e),(t=this.sourceSubscribers)===null||t===void 0||t.notify(e)}subscribe(e,t){var i;if(t){let r=this.subscribers[t];r===void 0&&(this.subscribers[t]=r=new Fe(this.source)),r.subscribe(e)}else this.sourceSubscribers=(i=this.sourceSubscribers)!==null&&i!==void 0?i:new Fe(this.source),this.sourceSubscribers.subscribe(e)}unsubscribe(e,t){var i;if(t){let r=this.subscribers[t];r!==void 0&&r.unsubscribe(e)}else(i=this.sourceSubscribers)===null||i===void 0||i.unsubscribe(e)}};var y=Xe.getById(2,()=>{let o=/(:|&&|\|\||if)/,e=new WeakMap,t=v.queueUpdate,i,r=d=>{throw new Error("Must call enableArrayObservation before observing arrays.")};function n(d){let u=d.$fastController||e.get(d);return u===void 0&&(Array.isArray(d)?u=r(d):e.set(d,u=new lt(d))),u}let s=jt();class a{constructor(u){this.name=u,this.field=`_${u}`,this.callback=`${u}Changed`}getValue(u){return i!==void 0&&i.watch(u,this.name),u[this.field]}setValue(u,p){let g=this.field,R=u[g];if(R!==p){u[g]=p;let A=u[this.callback];typeof A=="function"&&A.call(u,R,p),n(u).notify(this.name)}}}class c extends Fe{constructor(u,p,g=!1){super(u,p),this.binding=u,this.isVolatileBinding=g,this.needsRefresh=!0,this.needsQueue=!0,this.first=this,this.last=null,this.propertySource=void 0,this.propertyName=void 0,this.notifier=void 0,this.next=void 0}observe(u,p){this.needsRefresh&&this.last!==null&&this.disconnect();let g=i;i=this.needsRefresh?this:void 0,this.needsRefresh=this.isVolatileBinding;let R=this.binding(u,p);return i=g,R}disconnect(){if(this.last!==null){let u=this.first;for(;u!==void 0;)u.notifier.unsubscribe(this,u.propertyName),u=u.next;this.last=null,this.needsRefresh=this.needsQueue=!0}}watch(u,p){let g=this.last,R=n(u),A=g===null?this.first:{};if(A.propertySource=u,A.propertyName=p,A.notifier=R,R.subscribe(this,p),g!==null){if(!this.needsRefresh){let z;i=void 0,z=g.propertySource[g.propertyName],i=this,u===z&&(this.needsRefresh=!0)}g.next=A}this.last=A}handleChange(){this.needsQueue&&(this.needsQueue=!1,t(this))}call(){this.last!==null&&(this.needsQueue=!0,this.notify(this))}records(){let u=this.first;return{next:()=>{let p=u;return p===void 0?{value:void 0,done:!0}:(u=u.next,{value:p,done:!1})},[Symbol.iterator]:function(){return this}}}}return Object.freeze({setArrayObserverFactory(d){r=d},getNotifier:n,track(d,u){i!==void 0&&i.watch(d,u)},trackVolatile(){i!==void 0&&(i.needsRefresh=!0)},notify(d,u){n(d).notify(u)},defineProperty(d,u){typeof u=="string"&&(u=new a(u)),s(d).push(u),Reflect.defineProperty(d,u.name,{enumerable:!0,get:function(){return u.getValue(this)},set:function(p){u.setValue(this,p)}})},getAccessors:s,binding(d,u,p=this.isVolatileBinding(d)){return new c(d,u,p)},isVolatileBinding(d){return o.test(d.toString())}})});function f(o,e){y.defineProperty(o,e)}function Ji(o,e,t){return Object.assign({},t,{get:function(){return y.trackVolatile(),t.get.apply(this)}})}var Zi=Xe.getById(3,()=>{let o=null;return{get(){return o},set(e){o=e}}}),Be=class{constructor(){this.index=0,this.length=0,this.parent=null,this.parentContext=null}get event(){return Zi.get()}get isEven(){return this.index%2===0}get isOdd(){return this.index%2!==0}get isFirst(){return this.index===0}get isInMiddle(){return!this.isFirst&&!this.isLast}get isLast(){return this.index===this.length-1}static setEvent(e){Zi.set(e)}};y.defineProperty(Be.prototype,"index");y.defineProperty(Be.prototype,"length");var _e=Object.seal(new Be);var Le=class{constructor(){this.targetIndex=0}},ct=class extends Le{constructor(){super(...arguments),this.createPlaceholder=v.createInterpolationPlaceholder}},He=class extends Le{constructor(e,t,i){super(),this.name=e,this.behavior=t,this.options=i}createPlaceholder(e){return v.createCustomAttributePlaceholder(this.name,e)}createBehavior(e){return new this.behavior(e,this.options)}};function Is(o,e){this.source=o,this.context=e,this.bindingObserver===null&&(this.bindingObserver=y.binding(this.binding,this,this.isBindingVolatile)),this.updateTarget(this.bindingObserver.observe(o,e))}function Os(o,e){this.source=o,this.context=e,this.target.addEventListener(this.targetName,this)}function Rs(){this.bindingObserver.disconnect(),this.source=null,this.context=null}function As(){this.bindingObserver.disconnect(),this.source=null,this.context=null;let o=this.target.$fastView;o!==void 0&&o.isComposed&&(o.unbind(),o.needsBindOnly=!0)}function Es(){this.target.removeEventListener(this.targetName,this),this.source=null,this.context=null}function Ds(o){v.setAttribute(this.target,this.targetName,o)}function Ps(o){v.setBooleanAttribute(this.target,this.targetName,o)}function Fs(o){if(o==null&&(o=""),o.create){this.target.textContent="";let e=this.target.$fastView;e===void 0?e=o.create():this.target.$fastTemplate!==o&&(e.isComposed&&(e.remove(),e.unbind()),e=o.create()),e.isComposed?e.needsBindOnly&&(e.needsBindOnly=!1,e.bind(this.source,this.context)):(e.isComposed=!0,e.bind(this.source,this.context),e.insertBefore(this.target),this.target.$fastView=e,this.target.$fastTemplate=o)}else{let e=this.target.$fastView;e!==void 0&&e.isComposed&&(e.isComposed=!1,e.remove(),e.needsBindOnly?e.needsBindOnly=!1:e.unbind()),this.target.textContent=o}}function Bs(o){this.target[this.targetName]=o}function _s(o){let e=this.classVersions||Object.create(null),t=this.target,i=this.version||0;if(o!=null&&o.length){let r=o.split(/\s+/);for(let n=0,s=r.length;n<s;++n){let a=r[n];a!==""&&(e[a]=i,t.classList.add(a))}}if(this.classVersions=e,this.version=i+1,i!==0){i-=1;for(let r in e)e[r]===i&&t.classList.remove(r)}}var Ye=class extends ct{constructor(e){super(),this.binding=e,this.bind=Is,this.unbind=Rs,this.updateTarget=Ds,this.isBindingVolatile=y.isVolatileBinding(this.binding)}get targetName(){return this.originalTargetName}set targetName(e){if(this.originalTargetName=e,e!==void 0)switch(e[0]){case":":if(this.cleanedTargetName=e.substr(1),this.updateTarget=Bs,this.cleanedTargetName==="innerHTML"){let t=this.binding;this.binding=(i,r)=>v.createHTML(t(i,r))}break;case"?":this.cleanedTargetName=e.substr(1),this.updateTarget=Ps;break;case"@":this.cleanedTargetName=e.substr(1),this.bind=Os,this.unbind=Es;break;default:this.cleanedTargetName=e,e==="class"&&(this.updateTarget=_s);break}}targetAtContent(){this.updateTarget=Fs,this.unbind=As}createBehavior(e){return new Oo(e,this.binding,this.isBindingVolatile,this.bind,this.unbind,this.updateTarget,this.cleanedTargetName)}},Oo=class{constructor(e,t,i,r,n,s,a){this.source=null,this.context=null,this.bindingObserver=null,this.target=e,this.binding=t,this.isBindingVolatile=i,this.bind=r,this.unbind=n,this.updateTarget=s,this.targetName=a}handleChange(){this.updateTarget(this.bindingObserver.observe(this.source,this.context))}handleEvent(e){Be.setEvent(e);let t=this.binding(this.source,this.context);Be.setEvent(null),t!==!0&&e.preventDefault()}};var Ro=null,Ao=class o{addFactory(e){e.targetIndex=this.targetIndex,this.behaviorFactories.push(e)}captureContentBinding(e){e.targetAtContent(),this.addFactory(e)}reset(){this.behaviorFactories=[],this.targetIndex=-1}release(){Ro=this}static borrow(e){let t=Ro||new o;return t.directives=e,t.reset(),Ro=null,t}};function Ls(o){if(o.length===1)return o[0];let e,t=o.length,i=o.map(s=>typeof s=="string"?()=>s:(e=s.targetName||e,s.binding)),r=(s,a)=>{let c="";for(let d=0;d<t;++d)c+=i[d](s,a);return c},n=new Ye(r);return n.targetName=e,n}var Hs=Ut.length;function er(o,e){let t=e.split(Io);if(t.length===1)return null;let i=[];for(let r=0,n=t.length;r<n;++r){let s=t[r],a=s.indexOf(Ut),c;if(a===-1)c=s;else{let d=parseInt(s.substring(0,a));i.push(o.directives[d]),c=s.substring(a+Hs)}c!==""&&i.push(c)}return i}function Ki(o,e,t=!1){let i=e.attributes;for(let r=0,n=i.length;r<n;++r){let s=i[r],a=s.value,c=er(o,a),d=null;c===null?t&&(d=new Ye(()=>a),d.targetName=s.name):d=Ls(c),d!==null&&(e.removeAttributeNode(s),r--,n--,o.addFactory(d))}}function Ms(o,e,t){let i=er(o,e.textContent);if(i!==null){let r=e;for(let n=0,s=i.length;n<s;++n){let a=i[n],c=n===0?e:r.parentNode.insertBefore(document.createTextNode(""),r.nextSibling);typeof a=="string"?c.textContent=a:(c.textContent=" ",o.captureContentBinding(a)),r=c,o.targetIndex++,c!==e&&t.nextNode()}o.targetIndex--}}function tr(o,e){let t=o.content;document.adoptNode(t);let i=Ao.borrow(e);Ki(i,o,!0);let r=i.behaviorFactories;i.reset();let n=v.createTemplateWalker(t),s;for(;s=n.nextNode();)switch(i.targetIndex++,s.nodeType){case 1:Ki(i,s);break;case 3:Ms(i,s,n);break;case 8:v.isMarker(s)&&i.addFactory(e[v.extractDirectiveIndexFromMarker(s)])}let a=0;(v.isMarker(t.firstChild)||t.childNodes.length===1&&e.length)&&(t.insertBefore(document.createComment(""),t.firstChild),a=-1);let c=i.behaviorFactories;return i.release(),{fragment:t,viewBehaviorFactories:c,hostBehaviorFactories:r,targetOffset:a}}var Eo=document.createRange(),dt=class{constructor(e,t){this.fragment=e,this.behaviors=t,this.source=null,this.context=null,this.firstChild=e.firstChild,this.lastChild=e.lastChild}appendTo(e){e.appendChild(this.fragment)}insertBefore(e){if(this.fragment.hasChildNodes())e.parentNode.insertBefore(this.fragment,e);else{let t=this.lastChild;if(e.previousSibling===t)return;let i=e.parentNode,r=this.firstChild,n;for(;r!==t;)n=r.nextSibling,i.insertBefore(r,e),r=n;i.insertBefore(t,e)}}remove(){let e=this.fragment,t=this.lastChild,i=this.firstChild,r;for(;i!==t;)r=i.nextSibling,e.appendChild(i),i=r;e.appendChild(t)}dispose(){let e=this.firstChild.parentNode,t=this.lastChild,i=this.firstChild,r;for(;i!==t;)r=i.nextSibling,e.removeChild(i),i=r;e.removeChild(t);let n=this.behaviors,s=this.source;for(let a=0,c=n.length;a<c;++a)n[a].unbind(s)}bind(e,t){let i=this.behaviors;if(this.source!==e)if(this.source!==null){let r=this.source;this.source=e,this.context=t;for(let n=0,s=i.length;n<s;++n){let a=i[n];a.unbind(r),a.bind(e,t)}}else{this.source=e,this.context=t;for(let r=0,n=i.length;r<n;++r)i[r].bind(e,t)}}unbind(){if(this.source===null)return;let e=this.behaviors,t=this.source;for(let i=0,r=e.length;i<r;++i)e[i].unbind(t);this.source=null}static disposeContiguousBatch(e){if(e.length!==0){Eo.setStartBefore(e[0].firstChild),Eo.setEndAfter(e[e.length-1].lastChild),Eo.deleteContents();for(let t=0,i=e.length;t<i;++t){let r=e[t],n=r.behaviors,s=r.source;for(let a=0,c=n.length;a<c;++a)n[a].unbind(s)}}}};var Gt=class{constructor(e,t){this.behaviorCount=0,this.hasHostBehaviors=!1,this.fragment=null,this.targetOffset=0,this.viewBehaviorFactories=null,this.hostBehaviorFactories=null,this.html=e,this.directives=t}create(e){if(this.fragment===null){let d,u=this.html;if(typeof u=="string"){d=document.createElement("template"),d.innerHTML=v.createHTML(u);let g=d.content.firstElementChild;g!==null&&g.tagName==="TEMPLATE"&&(d=g)}else d=u;let p=tr(d,this.directives);this.fragment=p.fragment,this.viewBehaviorFactories=p.viewBehaviorFactories,this.hostBehaviorFactories=p.hostBehaviorFactories,this.targetOffset=p.targetOffset,this.behaviorCount=this.viewBehaviorFactories.length+this.hostBehaviorFactories.length,this.hasHostBehaviors=this.hostBehaviorFactories.length>0}let t=this.fragment.cloneNode(!0),i=this.viewBehaviorFactories,r=new Array(this.behaviorCount),n=v.createTemplateWalker(t),s=0,a=this.targetOffset,c=n.nextNode();for(let d=i.length;s<d;++s){let u=i[s],p=u.targetIndex;for(;c!==null;)if(a===p){r[s]=u.createBehavior(c);break}else c=n.nextNode(),a++}if(this.hasHostBehaviors){let d=this.hostBehaviorFactories;for(let u=0,p=d.length;u<p;++u,++s)r[s]=d[u].createBehavior(e)}return new dt(t,r)}render(e,t,i){typeof t=="string"&&(t=document.getElementById(t)),i===void 0&&(i=t);let r=this.create(i);return r.bind(e,_e),r.appendTo(t),r}},Vs=/([ \x09\x0a\x0c\x0d])([^\0-\x1F\x7F-\x9F "'>=/]+)([ \x09\x0a\x0c\x0d]*=[ \x09\x0a\x0c\x0d]*(?:[^ \x09\x0a\x0c\x0d"'`<>=]*|"[^"]*|'[^']*))$/;function x(o,...e){let t=[],i="";for(let r=0,n=o.length-1;r<n;++r){let s=o[r],a=e[r];if(i+=s,a instanceof Gt){let c=a;a=()=>c}if(typeof a=="function"&&(a=new Ye(a)),a instanceof ct){let c=Vs.exec(s);c!==null&&(a.targetName=c[2])}a instanceof Le?(i+=a.createPlaceholder(t.length),t.push(a)):i+=a}return i+=o[o.length-1],new Gt(i,t)}var H=class{constructor(){this.targets=new WeakSet}addStylesTo(e){this.targets.add(e)}removeStylesFrom(e){this.targets.delete(e)}isAttachedTo(e){return this.targets.has(e)}withBehaviors(...e){return this.behaviors=this.behaviors===null?e:this.behaviors.concat(e),this}};H.create=(()=>{if(v.supportsAdoptedStyleSheets){let o=new Map;return e=>new Do(e,o)}return o=>new Po(o)})();function Fo(o){return o.map(e=>e instanceof H?Fo(e.styles):[e]).reduce((e,t)=>e.concat(t),[])}function or(o){return o.map(e=>e instanceof H?e.behaviors:null).reduce((e,t)=>t===null?e:(e===null&&(e=[]),e.concat(t)),null)}var qt=Symbol("prependToAdoptedStyleSheets");function ir(o){let e=[],t=[];return o.forEach(i=>(i[qt]?e:t).push(i)),{prepend:e,append:t}}var rr=(o,e)=>{let{prepend:t,append:i}=ir(e);o.adoptedStyleSheets=[...t,...o.adoptedStyleSheets,...i]},nr=(o,e)=>{o.adoptedStyleSheets=o.adoptedStyleSheets.filter(t=>e.indexOf(t)===-1)};if(v.supportsAdoptedStyleSheets)try{document.adoptedStyleSheets.push(),document.adoptedStyleSheets.splice(),rr=(o,e)=>{let{prepend:t,append:i}=ir(e);o.adoptedStyleSheets.splice(0,0,...t),o.adoptedStyleSheets.push(...i)},nr=(o,e)=>{for(let t of e){let i=o.adoptedStyleSheets.indexOf(t);i!==-1&&o.adoptedStyleSheets.splice(i,1)}}}catch{}var Do=class extends H{constructor(e,t){super(),this.styles=e,this.styleSheetCache=t,this._styleSheets=void 0,this.behaviors=or(e)}get styleSheets(){if(this._styleSheets===void 0){let e=this.styles,t=this.styleSheetCache;this._styleSheets=Fo(e).map(i=>{if(i instanceof CSSStyleSheet)return i;let r=t.get(i);return r===void 0&&(r=new CSSStyleSheet,r.replaceSync(i),t.set(i,r)),r})}return this._styleSheets}addStylesTo(e){rr(e,this.styleSheets),super.addStylesTo(e)}removeStylesFrom(e){nr(e,this.styleSheets),super.removeStylesFrom(e)}},Ns=0;function zs(){return`fast-style-class-${++Ns}`}var Po=class extends H{constructor(e){super(),this.styles=e,this.behaviors=null,this.behaviors=or(e),this.styleSheets=Fo(e),this.styleClass=zs()}addStylesTo(e){let t=this.styleSheets,i=this.styleClass;e=this.normalizeTarget(e);for(let r=0;r<t.length;r++){let n=document.createElement("style");n.innerHTML=t[r],n.className=i,e.append(n)}super.addStylesTo(e)}removeStylesFrom(e){e=this.normalizeTarget(e);let t=e.querySelectorAll(`.${this.styleClass}`);for(let i=0,r=t.length;i<r;++i)e.removeChild(t[i]);super.removeStylesFrom(e)}isAttachedTo(e){return super.isAttachedTo(this.normalizeTarget(e))}normalizeTarget(e){return e===document?document.body:e}};var Tt=Object.freeze({locate:jt()}),Bo={toView(o){return o?"true":"false"},fromView(o){return!(o==null||o==="false"||o===!1||o===0)}},G={toView(o){if(o==null)return null;let e=o*1;return isNaN(e)?null:e.toString()},fromView(o){if(o==null)return null;let e=o*1;return isNaN(e)?null:e}},Wt=class o{constructor(e,t,i=t.toLowerCase(),r="reflect",n){this.guards=new Set,this.Owner=e,this.name=t,this.attribute=i,this.mode=r,this.converter=n,this.fieldName=`_${t}`,this.callbackName=`${t}Changed`,this.hasCallback=this.callbackName in e.prototype,r==="boolean"&&n===void 0&&(this.converter=Bo)}setValue(e,t){let i=e[this.fieldName],r=this.converter;r!==void 0&&(t=r.fromView(t)),i!==t&&(e[this.fieldName]=t,this.tryReflectToAttribute(e),this.hasCallback&&e[this.callbackName](i,t),e.$fastController.notify(this.name))}getValue(e){return y.track(e,this.name),e[this.fieldName]}onAttributeChangedCallback(e,t){this.guards.has(e)||(this.guards.add(e),this.setValue(e,t),this.guards.delete(e))}tryReflectToAttribute(e){let t=this.mode,i=this.guards;i.has(e)||t==="fromView"||v.queueUpdate(()=>{i.add(e);let r=e[this.fieldName];switch(t){case"reflect":let n=this.converter;v.setAttribute(e,this.attribute,n!==void 0?n.toView(r):r);break;case"boolean":v.setBooleanAttribute(e,this.attribute,r);break}i.delete(e)})}static collect(e,...t){let i=[];t.push(Tt.locate(e));for(let r=0,n=t.length;r<n;++r){let s=t[r];if(s!==void 0)for(let a=0,c=s.length;a<c;++a){let d=s[a];typeof d=="string"?i.push(new o(e,d)):i.push(new o(e,d.property,d.attribute,d.mode,d.converter))}}return i}};function h(o,e){let t;function i(r,n){arguments.length>1&&(t.property=n),Tt.locate(r.constructor).push(t)}if(arguments.length>1){t={},i(o,e);return}return t=o===void 0?{}:o,i}var sr={mode:"open"},ar={},_o=Xe.getById(4,()=>{let o=new Map;return Object.freeze({register(e){return o.has(e.type)?!1:(o.set(e.type,e),!0)},getByType(e){return o.get(e)}})}),be=class{constructor(e,t=e.definition){typeof t=="string"&&(t={name:t}),this.type=e,this.name=t.name,this.template=t.template;let i=Wt.collect(e,t.attributes),r=new Array(i.length),n={},s={};for(let a=0,c=i.length;a<c;++a){let d=i[a];r[a]=d.attribute,n[d.name]=d,s[d.attribute]=d}this.attributes=i,this.observedAttributes=r,this.propertyLookup=n,this.attributeLookup=s,this.shadowOptions=t.shadowOptions===void 0?sr:t.shadowOptions===null?void 0:Object.assign(Object.assign({},sr),t.shadowOptions),this.elementOptions=t.elementOptions===void 0?ar:Object.assign(Object.assign({},ar),t.elementOptions),this.styles=t.styles===void 0?void 0:Array.isArray(t.styles)?H.create(t.styles):t.styles instanceof H?t.styles:H.create([t.styles])}get isDefined(){return!!_o.getByType(this.type)}define(e=customElements){let t=this.type;if(_o.register(this)){let i=this.attributes,r=t.prototype;for(let n=0,s=i.length;n<s;++n)y.defineProperty(r,i[n]);Reflect.defineProperty(t,"observedAttributes",{value:this.observedAttributes,enumerable:!0})}return e.get(this.name)||e.define(this.name,t,this.elementOptions),this}};be.forType=_o.getByType;var lr=new WeakMap,js={bubbles:!0,composed:!0,cancelable:!0};function Lo(o){return o.shadowRoot||lr.get(o)||null}var Qt=class o extends lt{constructor(e,t){super(e),this.boundObservables=null,this.behaviors=null,this.needsInitialization=!0,this._template=null,this._styles=null,this._isConnected=!1,this.$fastController=this,this.view=null,this.element=e,this.definition=t;let i=t.shadowOptions;if(i!==void 0){let n=e.attachShadow(i);i.mode==="closed"&&lr.set(e,n)}let r=y.getAccessors(e);if(r.length>0){let n=this.boundObservables=Object.create(null);for(let s=0,a=r.length;s<a;++s){let c=r[s].name,d=e[c];d!==void 0&&(delete e[c],n[c]=d)}}}get isConnected(){return y.track(this,"isConnected"),this._isConnected}setIsConnected(e){this._isConnected=e,y.notify(this,"isConnected")}get template(){return this._template}set template(e){this._template!==e&&(this._template=e,this.needsInitialization||this.renderTemplate(e))}get styles(){return this._styles}set styles(e){this._styles!==e&&(this._styles!==null&&this.removeStyles(this._styles),this._styles=e,!this.needsInitialization&&e!==null&&this.addStyles(e))}addStyles(e){let t=Lo(this.element)||this.element.getRootNode();if(e instanceof HTMLStyleElement)t.append(e);else if(!e.isAttachedTo(t)){let i=e.behaviors;e.addStylesTo(t),i!==null&&this.addBehaviors(i)}}removeStyles(e){let t=Lo(this.element)||this.element.getRootNode();if(e instanceof HTMLStyleElement)t.removeChild(e);else if(e.isAttachedTo(t)){let i=e.behaviors;e.removeStylesFrom(t),i!==null&&this.removeBehaviors(i)}}addBehaviors(e){let t=this.behaviors||(this.behaviors=new Map),i=e.length,r=[];for(let n=0;n<i;++n){let s=e[n];t.has(s)?t.set(s,t.get(s)+1):(t.set(s,1),r.push(s))}if(this._isConnected){let n=this.element;for(let s=0;s<r.length;++s)r[s].bind(n,_e)}}removeBehaviors(e,t=!1){let i=this.behaviors;if(i===null)return;let r=e.length,n=[];for(let s=0;s<r;++s){let a=e[s];if(i.has(a)){let c=i.get(a)-1;c===0||t?i.delete(a)&&n.push(a):i.set(a,c)}}if(this._isConnected){let s=this.element;for(let a=0;a<n.length;++a)n[a].unbind(s)}}onConnectedCallback(){if(this._isConnected)return;let e=this.element;this.needsInitialization?this.finishInitialization():this.view!==null&&this.view.bind(e,_e);let t=this.behaviors;if(t!==null)for(let[i]of t)i.bind(e,_e);this.setIsConnected(!0)}onDisconnectedCallback(){if(!this._isConnected)return;this.setIsConnected(!1);let e=this.view;e!==null&&e.unbind();let t=this.behaviors;if(t!==null){let i=this.element;for(let[r]of t)r.unbind(i)}}onAttributeChangedCallback(e,t,i){let r=this.definition.attributeLookup[e];r!==void 0&&r.onAttributeChangedCallback(this.element,i)}emit(e,t,i){return this._isConnected?this.element.dispatchEvent(new CustomEvent(e,Object.assign(Object.assign({detail:t},js),i))):!1}finishInitialization(){let e=this.element,t=this.boundObservables;if(t!==null){let r=Object.keys(t);for(let n=0,s=r.length;n<s;++n){let a=r[n];e[a]=t[a]}this.boundObservables=null}let i=this.definition;this._template===null&&(this.element.resolveTemplate?this._template=this.element.resolveTemplate():i.template&&(this._template=i.template||null)),this._template!==null&&this.renderTemplate(this._template),this._styles===null&&(this.element.resolveStyles?this._styles=this.element.resolveStyles():i.styles&&(this._styles=i.styles||null)),this._styles!==null&&this.addStyles(this._styles),this.needsInitialization=!1}renderTemplate(e){let t=this.element,i=Lo(t)||t;this.view!==null?(this.view.dispose(),this.view=null):this.needsInitialization||v.removeChildNodes(i),e&&(this.view=e.render(t,i,t))}static forCustomElement(e){let t=e.$fastController;if(t!==void 0)return t;let i=be.forType(e.constructor);if(i===void 0)throw new Error("Missing FASTElement definition.");return e.$fastController=new o(e,i)}};function cr(o){return class extends o{constructor(){super(),Qt.forCustomElement(this)}$emit(e,t,i){return this.$fastController.emit(e,t,i)}connectedCallback(){this.$fastController.onConnectedCallback()}disconnectedCallback(){this.$fastController.onDisconnectedCallback()}attributeChangedCallback(e,t,i){this.$fastController.onAttributeChangedCallback(e,t,i)}}}var Me=Object.assign(cr(HTMLElement),{from(o){return cr(o)},define(o,e){return new be(o,e).define().type}});var Ze=class{createCSS(){return""}createBehavior(){}};function Us(o,e){let t=[],i="",r=[];for(let n=0,s=o.length-1;n<s;++n){i+=o[n];let a=e[n];if(a instanceof Ze){let c=a.createBehavior();a=a.createCSS(),c&&r.push(c)}a instanceof H||a instanceof CSSStyleSheet?(i.trim()!==""&&(t.push(i),i=""),t.push(a)):i+=a}return i+=o[o.length-1],i.trim()!==""&&t.push(i),{styles:t,behaviors:r}}function C(o,...e){let{styles:t,behaviors:i}=Us(o,e),r=H.create(t);return i.length&&r.withBehaviors(...i),r}function oe(o,e,t){return{index:o,removed:e,addedCount:t}}var hr=0,ur=1,Ho=2,Mo=3;function Gs(o,e,t,i,r,n){let s=n-r+1,a=t-e+1,c=new Array(s),d,u;for(let p=0;p<s;++p)c[p]=new Array(a),c[p][0]=p;for(let p=0;p<a;++p)c[0][p]=p;for(let p=1;p<s;++p)for(let g=1;g<a;++g)o[e+g-1]===i[r+p-1]?c[p][g]=c[p-1][g-1]:(d=c[p-1][g]+1,u=c[p][g-1]+1,c[p][g]=d<u?d:u);return c}function qs(o){let e=o.length-1,t=o[0].length-1,i=o[e][t],r=[];for(;e>0||t>0;){if(e===0){r.push(Ho),t--;continue}if(t===0){r.push(Mo),e--;continue}let n=o[e-1][t-1],s=o[e-1][t],a=o[e][t-1],c;s<a?c=s<n?s:n:c=a<n?a:n,c===n?(n===i?r.push(hr):(r.push(ur),i=n),e--,t--):c===s?(r.push(Mo),e--,i=s):(r.push(Ho),t--,i=a)}return r.reverse(),r}function Ws(o,e,t){for(let i=0;i<t;++i)if(o[i]!==e[i])return i;return t}function Qs(o,e,t){let i=o.length,r=e.length,n=0;for(;n<t&&o[--i]===e[--r];)n++;return n}function Xs(o,e,t,i){return e<t||i<o?-1:e===t||i===o?0:o<t?e<i?e-t:i-t:i<e?i-o:e-o}function Vo(o,e,t,i,r,n){let s=0,a=0,c=Math.min(t-e,n-r);if(e===0&&r===0&&(s=Ws(o,i,c)),t===o.length&&n===i.length&&(a=Qs(o,i,c-s)),e+=s,r+=s,t-=a,n-=a,t-e===0&&n-r===0)return te;if(e===t){let A=oe(e,[],0);for(;r<n;)A.removed.push(i[r++]);return[A]}else if(r===n)return[oe(e,[],t-e)];let d=qs(Gs(o,e,t,i,r,n)),u=[],p,g=e,R=r;for(let A=0;A<d.length;++A)switch(d[A]){case hr:p!==void 0&&(u.push(p),p=void 0),g++,R++;break;case ur:p===void 0&&(p=oe(g,[],0)),p.addedCount++,g++,p.removed.push(i[R]),R++;break;case Ho:p===void 0&&(p=oe(g,[],0)),p.addedCount++,g++;break;case Mo:p===void 0&&(p=oe(g,[],0)),p.removed.push(i[R]),R++;break}return p!==void 0&&u.push(p),u}var dr=Array.prototype.push;function Ys(o,e,t,i){let r=oe(e,t,i),n=!1,s=0;for(let a=0;a<o.length;a++){let c=o[a];if(c.index+=s,n)continue;let d=Xs(r.index,r.index+r.removed.length,c.index,c.index+c.addedCount);if(d>=0){o.splice(a,1),a--,s-=c.addedCount-c.removed.length,r.addedCount+=c.addedCount-d;let u=r.removed.length+c.removed.length-d;if(!r.addedCount&&!u)n=!0;else{let p=c.removed;if(r.index<c.index){let g=r.removed.slice(0,c.index-r.index);dr.apply(g,p),p=g}if(r.index+r.removed.length>c.index+c.addedCount){let g=r.removed.slice(c.index+c.addedCount-r.index);dr.apply(p,g)}r.removed=p,c.index<r.index&&(r.index=c.index)}}else if(r.index<c.index){n=!0,o.splice(a,0,r),a++;let u=r.addedCount-r.removed.length;c.index+=u,s+=u}}n||o.push(r)}function Zs(o){let e=[];for(let t=0,i=o.length;t<i;t++){let r=o[t];Ys(e,r.index,r.removed,r.addedCount)}return e}function pr(o,e){let t=[],i=Zs(e);for(let r=0,n=i.length;r<n;++r){let s=i[r];if(s.addedCount===1&&s.removed.length===1){s.removed[0]!==o[s.index]&&t.push(s);continue}t=t.concat(Vo(o,s.index,s.index+s.addedCount,s.removed,0,s.removed.length))}return t}var fr=!1;function No(o,e){let t=o.index,i=e.length;return t>i?t=i-o.addedCount:t<0&&(t=i+o.removed.length+t-o.addedCount),t<0&&(t=0),o.index=t,o}var zo=class extends Fe{constructor(e){super(e),this.oldCollection=void 0,this.splices=void 0,this.needsQueue=!0,this.call=this.flush,Reflect.defineProperty(e,"$fastController",{value:this,enumerable:!1})}subscribe(e){this.flush(),super.subscribe(e)}addSplice(e){this.splices===void 0?this.splices=[e]:this.splices.push(e),this.needsQueue&&(this.needsQueue=!1,v.queueUpdate(this))}reset(e){this.oldCollection=e,this.needsQueue&&(this.needsQueue=!1,v.queueUpdate(this))}flush(){let e=this.splices,t=this.oldCollection;if(e===void 0&&t===void 0)return;this.needsQueue=!0,this.splices=void 0,this.oldCollection=void 0;let i=t===void 0?pr(this.source,e):Vo(this.source,0,this.source.length,t,0,t.length);this.notify(i)}};function mr(){if(fr)return;fr=!0,y.setArrayObserverFactory(c=>new zo(c));let o=Array.prototype;if(o.$fastPatch)return;Reflect.defineProperty(o,"$fastPatch",{value:1,enumerable:!1});let e=o.pop,t=o.push,i=o.reverse,r=o.shift,n=o.sort,s=o.splice,a=o.unshift;o.pop=function(){let c=this.length>0,d=e.apply(this,arguments),u=this.$fastController;return u!==void 0&&c&&u.addSplice(oe(this.length,[d],0)),d},o.push=function(){let c=t.apply(this,arguments),d=this.$fastController;return d!==void 0&&d.addSplice(No(oe(this.length-arguments.length,[],arguments.length),this)),c},o.reverse=function(){let c,d=this.$fastController;d!==void 0&&(d.flush(),c=this.slice());let u=i.apply(this,arguments);return d!==void 0&&d.reset(c),u},o.shift=function(){let c=this.length>0,d=r.apply(this,arguments),u=this.$fastController;return u!==void 0&&c&&u.addSplice(oe(0,[d],0)),d},o.sort=function(){let c,d=this.$fastController;d!==void 0&&(d.flush(),c=this.slice());let u=n.apply(this,arguments);return d!==void 0&&d.reset(c),u},o.splice=function(){let c=s.apply(this,arguments),d=this.$fastController;return d!==void 0&&d.addSplice(No(oe(+arguments[0],c,arguments.length>2?arguments.length-2:0),this)),c},o.unshift=function(){let c=a.apply(this,arguments),d=this.$fastController;return d!==void 0&&d.addSplice(No(oe(0,[],arguments.length),this)),c}}var jo=class{constructor(e,t){this.target=e,this.propertyName=t}bind(e){e[this.propertyName]=this.target}unbind(){}};function _(o){return new He("fast-ref",jo,o)}var Uo=o=>typeof o=="function";var Js=()=>null;function br(o){return o===void 0?Js:Uo(o)?o:()=>o}function ht(o,e,t){let i=Uo(o)?o:()=>o,r=br(e),n=br(t);return(s,a)=>i(s,a)?r(s,a):n(s,a)}var Vl=Object.freeze({positioning:!1,recycle:!0});function Ks(o,e,t,i){o.bind(e[t],i)}function ea(o,e,t,i){let r=Object.create(i);r.index=t,r.length=e.length,o.bind(e[t],r)}var Go=class{constructor(e,t,i,r,n,s){this.location=e,this.itemsBinding=t,this.templateBinding=r,this.options=s,this.source=null,this.views=[],this.items=null,this.itemsObserver=null,this.originalContext=void 0,this.childContext=void 0,this.bindView=Ks,this.itemsBindingObserver=y.binding(t,this,i),this.templateBindingObserver=y.binding(r,this,n),s.positioning&&(this.bindView=ea)}bind(e,t){this.source=e,this.originalContext=t,this.childContext=Object.create(t),this.childContext.parent=e,this.childContext.parentContext=this.originalContext,this.items=this.itemsBindingObserver.observe(e,this.originalContext),this.template=this.templateBindingObserver.observe(e,this.originalContext),this.observeItems(!0),this.refreshAllViews()}unbind(){this.source=null,this.items=null,this.itemsObserver!==null&&this.itemsObserver.unsubscribe(this),this.unbindAllViews(),this.itemsBindingObserver.disconnect(),this.templateBindingObserver.disconnect()}handleChange(e,t){e===this.itemsBinding?(this.items=this.itemsBindingObserver.observe(this.source,this.originalContext),this.observeItems(),this.refreshAllViews()):e===this.templateBinding?(this.template=this.templateBindingObserver.observe(this.source,this.originalContext),this.refreshAllViews(!0)):this.updateViews(t)}observeItems(e=!1){if(!this.items){this.items=te;return}let t=this.itemsObserver,i=this.itemsObserver=y.getNotifier(this.items),r=t!==i;r&&t!==null&&t.unsubscribe(this),(r||e)&&i.subscribe(this)}updateViews(e){let t=this.childContext,i=this.views,r=this.bindView,n=this.items,s=this.template,a=this.options.recycle,c=[],d=0,u=0;for(let p=0,g=e.length;p<g;++p){let R=e[p],A=R.removed,z=0,de=R.index,$t=de+R.addedCount,Pe=i.splice(R.index,A.length),Ss=u=c.length+Pe.length;for(;de<$t;++de){let Qi=i[de],Ts=Qi?Qi.firstChild:this.location,at;a&&u>0?(z<=Ss&&Pe.length>0?(at=Pe[z],z++):(at=c[d],d++),u--):at=s.create(),i.splice(de,0,at),r(at,n,de,t),at.insertBefore(Ts)}Pe[z]&&c.push(...Pe.slice(z))}for(let p=d,g=c.length;p<g;++p)c[p].dispose();if(this.options.positioning)for(let p=0,g=i.length;p<g;++p){let R=i[p].context;R.length=g,R.index=p}}refreshAllViews(e=!1){let t=this.items,i=this.childContext,r=this.template,n=this.location,s=this.bindView,a=t.length,c=this.views,d=c.length;if((a===0||e||!this.options.recycle)&&(dt.disposeContiguousBatch(c),d=0),d===0){this.views=c=new Array(a);for(let u=0;u<a;++u){let p=r.create();s(p,t,u,i),c[u]=p,p.insertBefore(n)}}else{let u=0;for(;u<a;++u)if(u<d){let g=c[u];s(g,t,u,i)}else{let g=r.create();s(g,t,u,i),c.push(g),g.insertBefore(n)}let p=c.splice(u,d-u);for(u=0,a=p.length;u<a;++u)p[u].dispose()}}unbindAllViews(){let e=this.views;for(let t=0,i=e.length;t<i;++t)e[t].unbind()}},ut=class extends Le{constructor(e,t,i){super(),this.itemsBinding=e,this.templateBinding=t,this.options=i,this.createPlaceholder=v.createBlockPlaceholder,mr(),this.isItemsBindingVolatile=y.isVolatileBinding(e),this.isTemplateBindingVolatile=y.isVolatileBinding(t)}createBehavior(e){return new Go(e,this.itemsBinding,this.isItemsBindingVolatile,this.templateBinding,this.isTemplateBindingVolatile,this.options)}};function Je(o){return o?function(e,t,i){return e.nodeType===1&&e.matches(o)}:function(e,t,i){return e.nodeType===1}}var pt=class{constructor(e,t){this.target=e,this.options=t,this.source=null}bind(e){let t=this.options.property;this.shouldUpdate=y.getAccessors(e).some(i=>i.name===t),this.source=e,this.updateTarget(this.computeNodes()),this.shouldUpdate&&this.observe()}unbind(){this.updateTarget(te),this.source=null,this.shouldUpdate&&this.disconnect()}handleEvent(){this.updateTarget(this.computeNodes())}computeNodes(){let e=this.getNodes();return this.options.filter!==void 0&&(e=e.filter(this.options.filter)),e}updateTarget(e){this.source[this.options.property]=e}};var qo=class extends pt{constructor(e,t){super(e,t)}observe(){this.target.addEventListener("slotchange",this)}disconnect(){this.target.removeEventListener("slotchange",this)}getNodes(){return this.target.assignedNodes(this.options)}};function B(o){return typeof o=="string"&&(o={property:o}),new He("fast-slotted",qo,o)}var Wo=class extends pt{constructor(e,t){super(e,t),this.observer=null,t.childList=!0}observe(){this.observer===null&&(this.observer=new MutationObserver(this.handleEvent.bind(this))),this.observer.observe(this.target,this.options)}disconnect(){this.observer.disconnect()}getNodes(){return"subtree"in this.options?Array.from(this.target.querySelectorAll(this.options.selector)):Array.from(this.target.childNodes)}};function Xt(o){return typeof o=="string"&&(o={property:o}),new He("fast-children",Wo,o)}var X=class{handleStartContentChange(){this.startContainer.classList.toggle("start",this.start.assignedNodes().length>0)}handleEndContentChange(){this.endContainer.classList.toggle("end",this.end.assignedNodes().length>0)}},ie=(o,e)=>x`
    <span
        part="end"
        ${_("endContainer")}
        class=${t=>e.end?"end":void 0}
    >
        <slot name="end" ${_("end")} @slotchange="${t=>t.handleEndContentChange()}">
            ${e.end||""}
        </slot>
    </span>
`,re=(o,e)=>x`
    <span
        part="start"
        ${_("startContainer")}
        class="${t=>e.start?"start":void 0}"
    >
        <slot
            name="start"
            ${_("start")}
            @slotchange="${t=>t.handleStartContentChange()}"
        >
            ${e.start||""}
        </slot>
    </span>
`,Cc=x`
    <span part="end" ${_("endContainer")}>
        <slot
            name="end"
            ${_("end")}
            @slotchange="${o=>o.handleEndContentChange()}"
        ></slot>
    </span>
`,kc=x`
    <span part="start" ${_("startContainer")}>
        <slot
            name="start"
            ${_("start")}
            @slotchange="${o=>o.handleStartContentChange()}"
        ></slot>
    </span>
`;function l(o,e,t,i){var r=arguments.length,n=r<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,t):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(o,e,t,i);else for(var a=o.length-1;a>=0;a--)(s=o[a])&&(n=(r<3?s(n):r>3?s(e,t,n):s(e,t))||n);return r>3&&n&&Object.defineProperty(e,t,n),n}var Qo=new Map;"metadata"in Reflect||(Reflect.metadata=function(o,e){return function(t){Reflect.defineMetadata(o,e,t)}},Reflect.defineMetadata=function(o,e,t){let i=Qo.get(t);i===void 0&&Qo.set(t,i=new Map),i.set(o,e)},Reflect.getOwnMetadata=function(o,e){let t=Qo.get(e);if(t!==void 0)return t.get(o)});var Jo=class{constructor(e,t){this.container=e,this.key=t}instance(e){return this.registerResolver(0,e)}singleton(e){return this.registerResolver(1,e)}transient(e){return this.registerResolver(2,e)}callback(e){return this.registerResolver(3,e)}cachedCallback(e){return this.registerResolver(3,Ir(e))}aliasTo(e){return this.registerResolver(5,e)}registerResolver(e,t){let{container:i,key:r}=this;return this.container=this.key=void 0,i.registerResolver(r,new q(r,e,t))}};function It(o){let e=o.slice(),t=Object.keys(o),i=t.length,r;for(let n=0;n<i;++n)r=t[n],Or(r)||(e[r]=o[r]);return e}var ta=Object.freeze({none(o){throw Error(`${o.toString()} not registered, did you forget to add @singleton()?`)},singleton(o){return new q(o,1,o)},transient(o){return new q(o,2,o)}}),Xo=Object.freeze({default:Object.freeze({parentLocator:()=>null,responsibleForOwnerRequests:!1,defaultResolver:ta.singleton})}),gr=new Map;function vr(o){return e=>Reflect.getOwnMetadata(o,e)}var xr=null,I=Object.freeze({createContainer(o){return new Ot(null,Object.assign({},Xo.default,o))},findResponsibleContainer(o){let e=o.$$container$$;return e&&e.responsibleForOwnerRequests?e:I.findParentContainer(o)},findParentContainer(o){let e=new CustomEvent(Tr,{bubbles:!0,composed:!0,cancelable:!0,detail:{container:void 0}});return o.dispatchEvent(e),e.detail.container||I.getOrCreateDOMContainer()},getOrCreateDOMContainer(o,e){return o?o.$$container$$||new Ot(o,Object.assign({},Xo.default,e,{parentLocator:I.findParentContainer})):xr||(xr=new Ot(null,Object.assign({},Xo.default,e,{parentLocator:()=>null})))},getDesignParamtypes:vr("design:paramtypes"),getAnnotationParamtypes:vr("di:paramtypes"),getOrCreateAnnotationParamTypes(o){let e=this.getAnnotationParamtypes(o);return e===void 0&&Reflect.defineMetadata("di:paramtypes",e=[],o),e},getDependencies(o){let e=gr.get(o);if(e===void 0){let t=o.inject;if(t===void 0){let i=I.getDesignParamtypes(o),r=I.getAnnotationParamtypes(o);if(i===void 0)if(r===void 0){let n=Object.getPrototypeOf(o);typeof n=="function"&&n!==Function.prototype?e=It(I.getDependencies(n)):e=[]}else e=It(r);else if(r===void 0)e=It(i);else{e=It(i);let n=r.length,s;for(let d=0;d<n;++d)s=r[d],s!==void 0&&(e[d]=s);let a=Object.keys(r);n=a.length;let c;for(let d=0;d<n;++d)c=a[d],Or(c)||(e[c]=r[c])}}else e=It(t);gr.set(o,e)}return e},defineProperty(o,e,t,i=!1){let r=`$di_${e}`;Reflect.defineProperty(o,e,{get:function(){let n=this[r];if(n===void 0&&(n=(this instanceof HTMLElement?I.findResponsibleContainer(this):I.getOrCreateDOMContainer()).get(t),this[r]=n,i&&this instanceof Me)){let a=this.$fastController,c=()=>{let u=I.findResponsibleContainer(this).get(t),p=this[r];u!==p&&(this[r]=n,a.notify(e))};a.subscribe({handleChange:c},"isConnected")}return n}})},createInterface(o,e){let t=typeof o=="function"?o:e,i=typeof o=="string"?o:o&&"friendlyName"in o&&o.friendlyName||kr,r=typeof o=="string"?!1:o&&"respectConnection"in o&&o.respectConnection||!1,n=function(s,a,c){if(s==null||new.target!==void 0)throw new Error(`No registration for interface: '${n.friendlyName}'`);if(a)I.defineProperty(s,a,n,r);else{let d=I.getOrCreateAnnotationParamTypes(s);d[c]=n}};return n.$isInterface=!0,n.friendlyName=i??"(anonymous)",t!=null&&(n.register=function(s,a){return t(new Jo(s,a??n))}),n.toString=function(){return`InterfaceSymbol<${n.friendlyName}>`},n},inject(...o){return function(e,t,i){if(typeof i=="number"){let r=I.getOrCreateAnnotationParamTypes(e),n=o[0];n!==void 0&&(r[i]=n)}else if(t)I.defineProperty(e,t,o[0]);else{let r=i?I.getOrCreateAnnotationParamTypes(i.value):I.getOrCreateAnnotationParamTypes(e),n;for(let s=0;s<o.length;++s)n=o[s],n!==void 0&&(r[s]=n)}}},transient(o){return o.register=function(t){return Ke.transient(o,o).register(t)},o.registerInRequestor=!1,o},singleton(o,e=ia){return o.register=function(i){return Ke.singleton(o,o).register(i)},o.registerInRequestor=e.scoped,o}}),oa=I.createInterface("Container");function Kt(o){return function(e){let t=function(i,r,n){I.inject(t)(i,r,n)};return t.$isResolver=!0,t.resolve=function(i,r){return o(e,i,r)},t}}var Ic=I.inject;var ia={scoped:!1};function ra(o){return function(e,t){t=!!t;let i=function(r,n,s){I.inject(i)(r,n,s)};return i.$isResolver=!0,i.resolve=function(r,n){return o(e,r,n,t)},i}}var Oc=ra((o,e,t,i)=>t.getAll(o,i)),Rc=Kt((o,e,t)=>()=>t.get(o)),Ac=Kt((o,e,t)=>{if(t.has(o,!0))return t.get(o)});function ei(o,e,t){I.inject(ei)(o,e,t)}ei.$isResolver=!0;ei.resolve=()=>{};var Ec=Kt((o,e,t)=>{let i=Sr(o,e),r=new q(o,0,i);return t.registerResolver(o,r),i}),Dc=Kt((o,e,t)=>Sr(o,e));function Sr(o,e){return e.getFactory(o).construct(e)}var q=class{constructor(e,t,i){this.key=e,this.strategy=t,this.state=i,this.resolving=!1}get $isResolver(){return!0}register(e){return e.registerResolver(this.key,this)}resolve(e,t){switch(this.strategy){case 0:return this.state;case 1:{if(this.resolving)throw new Error(`Cyclic dependency found: ${this.state.name}`);return this.resolving=!0,this.state=e.getFactory(this.state).construct(t),this.strategy=0,this.resolving=!1,this.state}case 2:{let i=e.getFactory(this.state);if(i===null)throw new Error(`Resolver for ${String(this.key)} returned a null factory`);return i.construct(t)}case 3:return this.state(e,t,this);case 4:return this.state[0].resolve(e,t);case 5:return t.get(this.state);default:throw new Error(`Invalid resolver strategy specified: ${this.strategy}.`)}}getFactory(e){var t,i,r;switch(this.strategy){case 1:case 2:return e.getFactory(this.state);case 5:return(r=(i=(t=e.getResolver(this.state))===null||t===void 0?void 0:t.getFactory)===null||i===void 0?void 0:i.call(t,e))!==null&&r!==void 0?r:null;default:return null}}};function yr(o){return this.get(o)}function na(o,e){return e(o)}var Ko=class{constructor(e,t){this.Type=e,this.dependencies=t,this.transformers=null}construct(e,t){let i;return t===void 0?i=new this.Type(...this.dependencies.map(yr,e)):i=new this.Type(...this.dependencies.map(yr,e),...t),this.transformers==null?i:this.transformers.reduce(na,i)}registerTransformer(e){(this.transformers||(this.transformers=[])).push(e)}},sa={$isResolver:!0,resolve(o,e){return e}};function Jt(o){return typeof o.register=="function"}function aa(o){return Jt(o)&&typeof o.registerInRequestor=="boolean"}function wr(o){return aa(o)&&o.registerInRequestor}function la(o){return o.prototype!==void 0}var ca=new Set(["Array","ArrayBuffer","Boolean","DataView","Date","Error","EvalError","Float32Array","Float64Array","Function","Int8Array","Int16Array","Int32Array","Map","Number","Object","Promise","RangeError","ReferenceError","RegExp","Set","SharedArrayBuffer","String","SyntaxError","TypeError","Uint8Array","Uint8ClampedArray","Uint16Array","Uint32Array","URIError","WeakMap","WeakSet"]),Tr="__DI_LOCATE_PARENT__",Yo=new Map,Ot=class o{constructor(e,t){this.owner=e,this.config=t,this._parent=void 0,this.registerDepth=0,this.context=null,e!==null&&(e.$$container$$=this),this.resolvers=new Map,this.resolvers.set(oa,sa),e instanceof Node&&e.addEventListener(Tr,i=>{i.composedPath()[0]!==this.owner&&(i.detail.container=this,i.stopImmediatePropagation())})}get parent(){return this._parent===void 0&&(this._parent=this.config.parentLocator(this.owner)),this._parent}get depth(){return this.parent===null?0:this.parent.depth+1}get responsibleForOwnerRequests(){return this.config.responsibleForOwnerRequests}registerWithContext(e,...t){return this.context=e,this.register(...t),this.context=null,this}register(...e){if(++this.registerDepth===100)throw new Error("Unable to autoregister dependency");let t,i,r,n,s,a=this.context;for(let c=0,d=e.length;c<d;++c)if(t=e[c],!!$r(t))if(Jt(t))t.register(this,a);else if(la(t))Ke.singleton(t,t).register(this);else for(i=Object.keys(t),n=0,s=i.length;n<s;++n)r=t[i[n]],$r(r)&&(Jt(r)?r.register(this,a):this.register(r));return--this.registerDepth,this}registerResolver(e,t){Yt(e);let i=this.resolvers,r=i.get(e);return r==null?i.set(e,t):r instanceof q&&r.strategy===4?r.state.push(t):i.set(e,new q(e,4,[r,t])),t}registerTransformer(e,t){let i=this.getResolver(e);if(i==null)return!1;if(i.getFactory){let r=i.getFactory(this);return r==null?!1:(r.registerTransformer(t),!0)}return!1}getResolver(e,t=!0){if(Yt(e),e.resolve!==void 0)return e;let i=this,r;for(;i!=null;)if(r=i.resolvers.get(e),r==null){if(i.parent==null){let n=wr(e)?this:i;return t?this.jitRegister(e,n):null}i=i.parent}else return r;return null}has(e,t=!1){return this.resolvers.has(e)?!0:t&&this.parent!=null?this.parent.has(e,!0):!1}get(e){if(Yt(e),e.$isResolver)return e.resolve(this,this);let t=this,i;for(;t!=null;)if(i=t.resolvers.get(e),i==null){if(t.parent==null){let r=wr(e)?this:t;return i=this.jitRegister(e,r),i.resolve(t,this)}t=t.parent}else return i.resolve(t,this);throw new Error(`Unable to resolve key: ${String(e)}`)}getAll(e,t=!1){Yt(e);let i=this,r=i,n;if(t){let s=te;for(;r!=null;)n=r.resolvers.get(e),n!=null&&(s=s.concat(Cr(n,r,i))),r=r.parent;return s}else for(;r!=null;)if(n=r.resolvers.get(e),n==null){if(r=r.parent,r==null)return te}else return Cr(n,r,i);return te}getFactory(e){let t=Yo.get(e);if(t===void 0){if(da(e))throw new Error(`${e.name} is a native function and therefore cannot be safely constructed by DI. If this is intentional, please use a callback or cachedCallback resolver.`);Yo.set(e,t=new Ko(e,I.getDependencies(e)))}return t}registerFactory(e,t){Yo.set(e,t)}createChild(e){return new o(null,Object.assign({},this.config,e,{parentLocator:()=>this}))}jitRegister(e,t){if(typeof e!="function")throw new Error(`Attempted to jitRegister something that is not a constructor: '${e}'. Did you forget to register this dependency?`);if(ca.has(e.name))throw new Error(`Attempted to jitRegister an intrinsic type: ${e.name}. Did you forget to add @inject(Key)`);if(Jt(e)){let i=e.register(t);if(!(i instanceof Object)||i.resolve==null){let r=t.resolvers.get(e);if(r!=null)return r;throw new Error("A valid resolver was not returned from the static register method")}return i}else{if(e.$isInterface)throw new Error(`Attempted to jitRegister an interface: ${e.friendlyName}`);{let i=this.config.defaultResolver(e,t);return t.resolvers.set(e,i),i}}}},Zo=new WeakMap;function Ir(o){return function(e,t,i){if(Zo.has(i))return Zo.get(i);let r=o(e,t,i);return Zo.set(i,r),r}}var Ke=Object.freeze({instance(o,e){return new q(o,0,e)},singleton(o,e){return new q(o,1,e)},transient(o,e){return new q(o,2,e)},callback(o,e){return new q(o,3,e)},cachedCallback(o,e){return new q(o,3,Ir(e))},aliasTo(o,e){return new q(e,5,o)}});function Yt(o){if(o==null)throw new Error("key/value cannot be null or undefined. Are you trying to inject/register something that doesn't exist with DI?")}function Cr(o,e,t){if(o instanceof q&&o.strategy===4){let i=o.state,r=i.length,n=new Array(r);for(;r--;)n[r]=i[r].resolve(e,t);return n}return[o.resolve(e,t)]}var kr="(anonymous)";function $r(o){return typeof o=="object"&&o!==null||typeof o=="function"}var da=function(){let o=new WeakMap,e=!1,t="",i=0;return function(r){return e=o.get(r),e===void 0&&(t=r.toString(),i=t.length,e=i>=29&&i<=100&&t.charCodeAt(i-1)===125&&t.charCodeAt(i-2)<=32&&t.charCodeAt(i-3)===93&&t.charCodeAt(i-4)===101&&t.charCodeAt(i-5)===100&&t.charCodeAt(i-6)===111&&t.charCodeAt(i-7)===99&&t.charCodeAt(i-8)===32&&t.charCodeAt(i-9)===101&&t.charCodeAt(i-10)===118&&t.charCodeAt(i-11)===105&&t.charCodeAt(i-12)===116&&t.charCodeAt(i-13)===97&&t.charCodeAt(i-14)===110&&t.charCodeAt(i-15)===88,o.set(r,e)),e}}(),Zt={};function Or(o){switch(typeof o){case"number":return o>=0&&(o|0)===o;case"string":{let e=Zt[o];if(e!==void 0)return e;let t=o.length;if(t===0)return Zt[o]=!1;let i=0;for(let r=0;r<t;++r)if(i=o.charCodeAt(r),r===0&&i===48&&t>1||i<48||i>57)return Zt[o]=!1;return Zt[o]=!0}default:return!1}}function Rr(o){return`${o.toLowerCase()}:presentation`}var eo=new Map,oo=Object.freeze({define(o,e,t){let i=Rr(o);eo.get(i)===void 0?eo.set(i,e):eo.set(i,!1),t.register(Ke.instance(i,e))},forTag(o,e){let t=Rr(o),i=eo.get(t);return i===!1?I.findResponsibleContainer(e).get(t):i||null}}),to=class{constructor(e,t){this.template=e||null,this.styles=t===void 0?null:Array.isArray(t)?H.create(t):t instanceof H?t:H.create([t])}applyTo(e){let t=e.$fastController;t.template===null&&(t.template=this.template),t.styles===null&&(t.styles=this.styles)}};var k=class o extends Me{constructor(){super(...arguments),this._presentation=void 0}get $presentation(){return this._presentation===void 0&&(this._presentation=oo.forTag(this.tagName,this)),this._presentation}templateChanged(){this.template!==void 0&&(this.$fastController.template=this.template)}stylesChanged(){this.styles!==void 0&&(this.$fastController.styles=this.styles)}connectedCallback(){this.$presentation!==null&&this.$presentation.applyTo(this),super.connectedCallback()}static compose(e){return(t={})=>new ti(this===o?class extends o{}:this,e,t)}};l([f],k.prototype,"template",void 0);l([f],k.prototype,"styles",void 0);function Rt(o,e,t){return typeof o=="function"?o(e,t):o}var ti=class{constructor(e,t,i){this.type=e,this.elementDefinition=t,this.overrideDefinition=i,this.definition=Object.assign(Object.assign({},this.elementDefinition),this.overrideDefinition)}register(e,t){let i=this.definition,r=this.overrideDefinition,s=`${i.prefix||t.elementPrefix}-${i.baseName}`;t.tryDefineElement({name:s,type:this.type,baseClass:this.elementDefinition.baseClass,callback:a=>{let c=new to(Rt(i.template,a,i),Rt(i.styles,a,i));a.definePresentation(c);let d=Rt(i.shadowOptions,a,i);a.shadowRootMode&&(d?r.shadowOptions||(d.mode=a.shadowRootMode):d!==null&&(d={mode:a.shadowRootMode})),a.defineElement({elementOptions:Rt(i.elementOptions,a,i),shadowOptions:d,attributes:Rt(i.attributes,a,i)})}})}};function L(o,...e){let t=Tt.locate(o);e.forEach(i=>{Object.getOwnPropertyNames(i.prototype).forEach(n=>{n!=="constructor"&&Object.defineProperty(o.prototype,n,Object.getOwnPropertyDescriptor(i.prototype,n))}),Tt.locate(i).forEach(n=>t.push(n))})}var ft={horizontal:"horizontal",vertical:"vertical"};function Ar(o,e){let t=o.length;for(;t--;)if(e(o[t],t,o))return t;return-1}function Er(){return!!(typeof window<"u"&&window.document&&window.document.createElement)}function Dr(...o){return o.every(e=>e instanceof HTMLElement)}function ha(){let o=document.querySelector('meta[property="csp-nonce"]');return o?o.getAttribute("content"):null}var et;function Pr(){if(typeof et=="boolean")return et;if(!Er())return et=!1,et;let o=document.createElement("style"),e=ha();e!==null&&o.setAttribute("nonce",e),document.head.appendChild(o);try{o.sheet.insertRule("foo:focus-visible {color:inherit}",0),et=!0}catch{et=!1}finally{document.head.removeChild(o)}return et}var oi="focus",ii="focusin",Te="focusout";var Ie="keydown";var Fr;(function(o){o[o.alt=18]="alt",o[o.arrowDown=40]="arrowDown",o[o.arrowLeft=37]="arrowLeft",o[o.arrowRight=39]="arrowRight",o[o.arrowUp=38]="arrowUp",o[o.back=8]="back",o[o.backSlash=220]="backSlash",o[o.break=19]="break",o[o.capsLock=20]="capsLock",o[o.closeBracket=221]="closeBracket",o[o.colon=186]="colon",o[o.colon2=59]="colon2",o[o.comma=188]="comma",o[o.ctrl=17]="ctrl",o[o.delete=46]="delete",o[o.end=35]="end",o[o.enter=13]="enter",o[o.equals=187]="equals",o[o.equals2=61]="equals2",o[o.equals3=107]="equals3",o[o.escape=27]="escape",o[o.forwardSlash=191]="forwardSlash",o[o.function1=112]="function1",o[o.function10=121]="function10",o[o.function11=122]="function11",o[o.function12=123]="function12",o[o.function2=113]="function2",o[o.function3=114]="function3",o[o.function4=115]="function4",o[o.function5=116]="function5",o[o.function6=117]="function6",o[o.function7=118]="function7",o[o.function8=119]="function8",o[o.function9=120]="function9",o[o.home=36]="home",o[o.insert=45]="insert",o[o.menu=93]="menu",o[o.minus=189]="minus",o[o.minus2=109]="minus2",o[o.numLock=144]="numLock",o[o.numPad0=96]="numPad0",o[o.numPad1=97]="numPad1",o[o.numPad2=98]="numPad2",o[o.numPad3=99]="numPad3",o[o.numPad4=100]="numPad4",o[o.numPad5=101]="numPad5",o[o.numPad6=102]="numPad6",o[o.numPad7=103]="numPad7",o[o.numPad8=104]="numPad8",o[o.numPad9=105]="numPad9",o[o.numPadDivide=111]="numPadDivide",o[o.numPadDot=110]="numPadDot",o[o.numPadMinus=109]="numPadMinus",o[o.numPadMultiply=106]="numPadMultiply",o[o.numPadPlus=107]="numPadPlus",o[o.openBracket=219]="openBracket",o[o.pageDown=34]="pageDown",o[o.pageUp=33]="pageUp",o[o.period=190]="period",o[o.print=44]="print",o[o.quote=222]="quote",o[o.scrollLock=145]="scrollLock",o[o.shift=16]="shift",o[o.space=32]="space",o[o.tab=9]="tab",o[o.tilde=192]="tilde",o[o.windowsLeft=91]="windowsLeft",o[o.windowsOpera=219]="windowsOpera",o[o.windowsRight=92]="windowsRight"})(Fr||(Fr={}));var K="ArrowDown",Ve="ArrowLeft",Ne="ArrowRight",ee="ArrowUp",ge="Enter",ze="Escape",ne="Home",se="End",Br="F2",_r="PageDown",Lr="PageUp",ve=" ",mt="Tab";var Hr={ArrowDown:K,ArrowLeft:Ve,ArrowRight:Ne,ArrowUp:ee};var je;(function(o){o.ltr="ltr",o.rtl="rtl"})(je||(je={}));function Mr(o,e,t){return Math.min(Math.max(t,o),e)}function At(o,e,t=0){return[e,t]=[e,t].sort((i,r)=>i-r),e<=o&&o<t}var ua=0;function tt(o=""){return`${o}${ua++}`}var Vr=(o,e)=>x`
    <a
        class="control"
        part="control"
        download="${t=>t.download}"
        href="${t=>t.href}"
        hreflang="${t=>t.hreflang}"
        ping="${t=>t.ping}"
        referrerpolicy="${t=>t.referrerpolicy}"
        rel="${t=>t.rel}"
        target="${t=>t.target}"
        type="${t=>t.type}"
        aria-atomic="${t=>t.ariaAtomic}"
        aria-busy="${t=>t.ariaBusy}"
        aria-controls="${t=>t.ariaControls}"
        aria-current="${t=>t.ariaCurrent}"
        aria-describedby="${t=>t.ariaDescribedby}"
        aria-details="${t=>t.ariaDetails}"
        aria-disabled="${t=>t.ariaDisabled}"
        aria-errormessage="${t=>t.ariaErrormessage}"
        aria-expanded="${t=>t.ariaExpanded}"
        aria-flowto="${t=>t.ariaFlowto}"
        aria-haspopup="${t=>t.ariaHaspopup}"
        aria-hidden="${t=>t.ariaHidden}"
        aria-invalid="${t=>t.ariaInvalid}"
        aria-keyshortcuts="${t=>t.ariaKeyshortcuts}"
        aria-label="${t=>t.ariaLabel}"
        aria-labelledby="${t=>t.ariaLabelledby}"
        aria-live="${t=>t.ariaLive}"
        aria-owns="${t=>t.ariaOwns}"
        aria-relevant="${t=>t.ariaRelevant}"
        aria-roledescription="${t=>t.ariaRoledescription}"
        ${_("control")}
    >
        ${re(o,e)}
        <span class="content" part="content">
            <slot ${B("defaultSlottedContent")}></slot>
        </span>
        ${ie(o,e)}
    </a>
`;var S=class{};l([h({attribute:"aria-atomic"})],S.prototype,"ariaAtomic",void 0);l([h({attribute:"aria-busy"})],S.prototype,"ariaBusy",void 0);l([h({attribute:"aria-controls"})],S.prototype,"ariaControls",void 0);l([h({attribute:"aria-current"})],S.prototype,"ariaCurrent",void 0);l([h({attribute:"aria-describedby"})],S.prototype,"ariaDescribedby",void 0);l([h({attribute:"aria-details"})],S.prototype,"ariaDetails",void 0);l([h({attribute:"aria-disabled"})],S.prototype,"ariaDisabled",void 0);l([h({attribute:"aria-errormessage"})],S.prototype,"ariaErrormessage",void 0);l([h({attribute:"aria-flowto"})],S.prototype,"ariaFlowto",void 0);l([h({attribute:"aria-haspopup"})],S.prototype,"ariaHaspopup",void 0);l([h({attribute:"aria-hidden"})],S.prototype,"ariaHidden",void 0);l([h({attribute:"aria-invalid"})],S.prototype,"ariaInvalid",void 0);l([h({attribute:"aria-keyshortcuts"})],S.prototype,"ariaKeyshortcuts",void 0);l([h({attribute:"aria-label"})],S.prototype,"ariaLabel",void 0);l([h({attribute:"aria-labelledby"})],S.prototype,"ariaLabelledby",void 0);l([h({attribute:"aria-live"})],S.prototype,"ariaLive",void 0);l([h({attribute:"aria-owns"})],S.prototype,"ariaOwns",void 0);l([h({attribute:"aria-relevant"})],S.prototype,"ariaRelevant",void 0);l([h({attribute:"aria-roledescription"})],S.prototype,"ariaRoledescription",void 0);var Y=class extends k{constructor(){super(...arguments),this.handleUnsupportedDelegatesFocus=()=>{var e;window.ShadowRoot&&!window.ShadowRoot.prototype.hasOwnProperty("delegatesFocus")&&(!((e=this.$fastController.definition.shadowOptions)===null||e===void 0)&&e.delegatesFocus)&&(this.focus=()=>{var t;(t=this.control)===null||t===void 0||t.focus()})}}connectedCallback(){super.connectedCallback(),this.handleUnsupportedDelegatesFocus()}};l([h],Y.prototype,"download",void 0);l([h],Y.prototype,"href",void 0);l([h],Y.prototype,"hreflang",void 0);l([h],Y.prototype,"ping",void 0);l([h],Y.prototype,"referrerpolicy",void 0);l([h],Y.prototype,"rel",void 0);l([h],Y.prototype,"target",void 0);l([h],Y.prototype,"type",void 0);l([f],Y.prototype,"defaultSlottedContent",void 0);var Et=class{};l([h({attribute:"aria-expanded"})],Et.prototype,"ariaExpanded",void 0);L(Et,S);L(Y,X,Et);var Nr=o=>{let e=o.closest("[dir]");return e!==null&&e.dir==="rtl"?je.rtl:je.ltr};var io=(o,e)=>x`
    <template class="${t=>t.circular?"circular":""}">
        <div class="control" part="control" style="${t=>t.generateBadgeStyle()}">
            <slot></slot>
        </div>
    </template>
`;var Oe=class extends k{constructor(){super(...arguments),this.generateBadgeStyle=()=>{if(!this.fill&&!this.color)return;let e=`background-color: var(--badge-fill-${this.fill});`,t=`color: var(--badge-color-${this.color});`;return this.fill&&!this.color?e:this.color&&!this.fill?t:`${t} ${e}`}}};l([h({attribute:"fill"})],Oe.prototype,"fill",void 0);l([h({attribute:"color"})],Oe.prototype,"color",void 0);l([h({mode:"boolean"})],Oe.prototype,"circular",void 0);var zr=(o,e)=>x`
    <button
        class="control"
        part="control"
        ?autofocus="${t=>t.autofocus}"
        ?disabled="${t=>t.disabled}"
        form="${t=>t.formId}"
        formaction="${t=>t.formaction}"
        formenctype="${t=>t.formenctype}"
        formmethod="${t=>t.formmethod}"
        formnovalidate="${t=>t.formnovalidate}"
        formtarget="${t=>t.formtarget}"
        name="${t=>t.name}"
        type="${t=>t.type}"
        value="${t=>t.value}"
        aria-atomic="${t=>t.ariaAtomic}"
        aria-busy="${t=>t.ariaBusy}"
        aria-controls="${t=>t.ariaControls}"
        aria-current="${t=>t.ariaCurrent}"
        aria-describedby="${t=>t.ariaDescribedby}"
        aria-details="${t=>t.ariaDetails}"
        aria-disabled="${t=>t.ariaDisabled}"
        aria-errormessage="${t=>t.ariaErrormessage}"
        aria-expanded="${t=>t.ariaExpanded}"
        aria-flowto="${t=>t.ariaFlowto}"
        aria-haspopup="${t=>t.ariaHaspopup}"
        aria-hidden="${t=>t.ariaHidden}"
        aria-invalid="${t=>t.ariaInvalid}"
        aria-keyshortcuts="${t=>t.ariaKeyshortcuts}"
        aria-label="${t=>t.ariaLabel}"
        aria-labelledby="${t=>t.ariaLabelledby}"
        aria-live="${t=>t.ariaLive}"
        aria-owns="${t=>t.ariaOwns}"
        aria-pressed="${t=>t.ariaPressed}"
        aria-relevant="${t=>t.ariaRelevant}"
        aria-roledescription="${t=>t.ariaRoledescription}"
        ${_("control")}
    >
        ${re(o,e)}
        <span class="content" part="content">
            <slot ${B("defaultSlottedContent")}></slot>
        </span>
        ${ie(o,e)}
    </button>
`;var jr="form-associated-proxy",Ur="ElementInternals",Gr=Ur in window&&"setFormValue"in window[Ur].prototype,qr=new WeakMap;function Re(o){let e=class extends o{constructor(...t){super(...t),this.dirtyValue=!1,this.disabled=!1,this.proxyEventsToBlock=["change","click"],this.proxyInitialized=!1,this.required=!1,this.initialValue=this.initialValue||"",this.elementInternals||(this.formResetCallback=this.formResetCallback.bind(this))}static get formAssociated(){return Gr}get validity(){return this.elementInternals?this.elementInternals.validity:this.proxy.validity}get form(){return this.elementInternals?this.elementInternals.form:this.proxy.form}get validationMessage(){return this.elementInternals?this.elementInternals.validationMessage:this.proxy.validationMessage}get willValidate(){return this.elementInternals?this.elementInternals.willValidate:this.proxy.willValidate}get labels(){if(this.elementInternals)return Object.freeze(Array.from(this.elementInternals.labels));if(this.proxy instanceof HTMLElement&&this.proxy.ownerDocument&&this.id){let t=this.proxy.labels,i=Array.from(this.proxy.getRootNode().querySelectorAll(`[for='${this.id}']`)),r=t?i.concat(Array.from(t)):i;return Object.freeze(r)}else return te}valueChanged(t,i){this.dirtyValue=!0,this.proxy instanceof HTMLElement&&(this.proxy.value=this.value),this.currentValue=this.value,this.setFormValue(this.value),this.validate()}currentValueChanged(){this.value=this.currentValue}initialValueChanged(t,i){this.dirtyValue||(this.value=this.initialValue,this.dirtyValue=!1)}disabledChanged(t,i){this.proxy instanceof HTMLElement&&(this.proxy.disabled=this.disabled),v.queueUpdate(()=>this.classList.toggle("disabled",this.disabled))}nameChanged(t,i){this.proxy instanceof HTMLElement&&(this.proxy.name=this.name)}requiredChanged(t,i){this.proxy instanceof HTMLElement&&(this.proxy.required=this.required),v.queueUpdate(()=>this.classList.toggle("required",this.required)),this.validate()}get elementInternals(){if(!Gr)return null;let t=qr.get(this);return t||(t=this.attachInternals(),qr.set(this,t)),t}connectedCallback(){super.connectedCallback(),this.addEventListener("keypress",this._keypressHandler),this.value||(this.value=this.initialValue,this.dirtyValue=!1),this.elementInternals||(this.attachProxy(),this.form&&this.form.addEventListener("reset",this.formResetCallback))}disconnectedCallback(){super.disconnectedCallback(),this.proxyEventsToBlock.forEach(t=>this.proxy.removeEventListener(t,this.stopPropagation)),!this.elementInternals&&this.form&&this.form.removeEventListener("reset",this.formResetCallback)}checkValidity(){return this.elementInternals?this.elementInternals.checkValidity():this.proxy.checkValidity()}reportValidity(){return this.elementInternals?this.elementInternals.reportValidity():this.proxy.reportValidity()}setValidity(t,i,r){this.elementInternals?this.elementInternals.setValidity(t,i,r):typeof i=="string"&&this.proxy.setCustomValidity(i)}formDisabledCallback(t){this.disabled=t}formResetCallback(){this.value=this.initialValue,this.dirtyValue=!1}attachProxy(){var t;this.proxyInitialized||(this.proxyInitialized=!0,this.proxy.style.display="none",this.proxyEventsToBlock.forEach(i=>this.proxy.addEventListener(i,this.stopPropagation)),this.proxy.disabled=this.disabled,this.proxy.required=this.required,typeof this.name=="string"&&(this.proxy.name=this.name),typeof this.value=="string"&&(this.proxy.value=this.value),this.proxy.setAttribute("slot",jr),this.proxySlot=document.createElement("slot"),this.proxySlot.setAttribute("name",jr)),(t=this.shadowRoot)===null||t===void 0||t.appendChild(this.proxySlot),this.appendChild(this.proxy)}detachProxy(){var t;this.removeChild(this.proxy),(t=this.shadowRoot)===null||t===void 0||t.removeChild(this.proxySlot)}validate(t){this.proxy instanceof HTMLElement&&this.setValidity(this.proxy.validity,this.proxy.validationMessage,t)}setFormValue(t,i){this.elementInternals&&this.elementInternals.setFormValue(t,i||t)}_keypressHandler(t){switch(t.key){case ge:if(this.form instanceof HTMLFormElement){let i=this.form.querySelector("[type=submit]");i?.click()}break}}stopPropagation(t){t.stopPropagation()}};return h({mode:"boolean"})(e.prototype,"disabled"),h({mode:"fromView",attribute:"value"})(e.prototype,"initialValue"),h({attribute:"current-value"})(e.prototype,"currentValue"),h(e.prototype,"name"),h({mode:"boolean"})(e.prototype,"required"),f(e.prototype,"value"),e}function ro(o){class e extends Re(o){}class t extends e{constructor(...r){super(r),this.dirtyChecked=!1,this.checkedAttribute=!1,this.checked=!1,this.dirtyChecked=!1}checkedAttributeChanged(){this.defaultChecked=this.checkedAttribute}defaultCheckedChanged(){this.dirtyChecked||(this.checked=this.defaultChecked,this.dirtyChecked=!1)}checkedChanged(r,n){this.dirtyChecked||(this.dirtyChecked=!0),this.currentChecked=this.checked,this.updateForm(),this.proxy instanceof HTMLInputElement&&(this.proxy.checked=this.checked),r!==void 0&&this.$emit("change"),this.validate()}currentCheckedChanged(r,n){this.checked=this.currentChecked}updateForm(){let r=this.checked?this.value:null;this.setFormValue(r,r)}connectedCallback(){super.connectedCallback(),this.updateForm()}formResetCallback(){super.formResetCallback(),this.checked=!!this.checkedAttribute,this.dirtyChecked=!1}}return h({attribute:"checked",mode:"boolean"})(t.prototype,"checkedAttribute"),h({attribute:"current-checked",converter:Bo})(t.prototype,"currentChecked"),f(t.prototype,"defaultChecked"),f(t.prototype,"checked"),t}var ri=class extends k{},no=class extends Re(ri){constructor(){super(...arguments),this.proxy=document.createElement("input")}};var Z=class extends no{constructor(){super(...arguments),this.handleClick=e=>{var t;this.disabled&&((t=this.defaultSlottedContent)===null||t===void 0?void 0:t.length)<=1&&e.stopPropagation()},this.handleSubmission=()=>{if(!this.form)return;let e=this.proxy.isConnected;e||this.attachProxy(),typeof this.form.requestSubmit=="function"?this.form.requestSubmit(this.proxy):this.proxy.click(),e||this.detachProxy()},this.handleFormReset=()=>{var e;(e=this.form)===null||e===void 0||e.reset()},this.handleUnsupportedDelegatesFocus=()=>{var e;window.ShadowRoot&&!window.ShadowRoot.prototype.hasOwnProperty("delegatesFocus")&&(!((e=this.$fastController.definition.shadowOptions)===null||e===void 0)&&e.delegatesFocus)&&(this.focus=()=>{this.control.focus()})}}formactionChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.formAction=this.formaction)}formenctypeChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.formEnctype=this.formenctype)}formmethodChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.formMethod=this.formmethod)}formnovalidateChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.formNoValidate=this.formnovalidate)}formtargetChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.formTarget=this.formtarget)}typeChanged(e,t){this.proxy instanceof HTMLInputElement&&(this.proxy.type=this.type),t==="submit"&&this.addEventListener("click",this.handleSubmission),e==="submit"&&this.removeEventListener("click",this.handleSubmission),t==="reset"&&this.addEventListener("click",this.handleFormReset),e==="reset"&&this.removeEventListener("click",this.handleFormReset)}validate(){super.validate(this.control)}connectedCallback(){var e;super.connectedCallback(),this.proxy.setAttribute("type",this.type),this.handleUnsupportedDelegatesFocus();let t=Array.from((e=this.control)===null||e===void 0?void 0:e.children);t&&t.forEach(i=>{i.addEventListener("click",this.handleClick)})}disconnectedCallback(){var e;super.disconnectedCallback();let t=Array.from((e=this.control)===null||e===void 0?void 0:e.children);t&&t.forEach(i=>{i.removeEventListener("click",this.handleClick)})}};l([h({mode:"boolean"})],Z.prototype,"autofocus",void 0);l([h({attribute:"form"})],Z.prototype,"formId",void 0);l([h],Z.prototype,"formaction",void 0);l([h],Z.prototype,"formenctype",void 0);l([h],Z.prototype,"formmethod",void 0);l([h({mode:"boolean"})],Z.prototype,"formnovalidate",void 0);l([h],Z.prototype,"formtarget",void 0);l([h],Z.prototype,"type",void 0);l([f],Z.prototype,"defaultSlottedContent",void 0);var bt=class{};l([h({attribute:"aria-expanded"})],bt.prototype,"ariaExpanded",void 0);l([h({attribute:"aria-pressed"})],bt.prototype,"ariaPressed",void 0);L(bt,S);L(Z,X,bt);var gt={none:"none",default:"default",sticky:"sticky"},xe={default:"default",columnHeader:"columnheader",rowHeader:"rowheader"},Ue={default:"default",header:"header",stickyHeader:"sticky-header"};var M=class extends k{constructor(){super(...arguments),this.rowType=Ue.default,this.rowData=null,this.columnDefinitions=null,this.isActiveRow=!1,this.cellsRepeatBehavior=null,this.cellsPlaceholder=null,this.focusColumnIndex=0,this.refocusOnLoad=!1,this.updateRowStyle=()=>{this.style.gridTemplateColumns=this.gridTemplateColumns}}gridTemplateColumnsChanged(){this.$fastController.isConnected&&this.updateRowStyle()}rowTypeChanged(){this.$fastController.isConnected&&this.updateItemTemplate()}rowDataChanged(){if(this.rowData!==null&&this.isActiveRow){this.refocusOnLoad=!0;return}}cellItemTemplateChanged(){this.updateItemTemplate()}headerCellItemTemplateChanged(){this.updateItemTemplate()}connectedCallback(){super.connectedCallback(),this.cellsRepeatBehavior===null&&(this.cellsPlaceholder=document.createComment(""),this.appendChild(this.cellsPlaceholder),this.updateItemTemplate(),this.cellsRepeatBehavior=new ut(e=>e.columnDefinitions,e=>e.activeCellItemTemplate,{positioning:!0}).createBehavior(this.cellsPlaceholder),this.$fastController.addBehaviors([this.cellsRepeatBehavior])),this.addEventListener("cell-focused",this.handleCellFocus),this.addEventListener(Te,this.handleFocusout),this.addEventListener(Ie,this.handleKeydown),this.updateRowStyle(),this.refocusOnLoad&&(this.refocusOnLoad=!1,this.cellElements.length>this.focusColumnIndex&&this.cellElements[this.focusColumnIndex].focus())}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("cell-focused",this.handleCellFocus),this.removeEventListener(Te,this.handleFocusout),this.removeEventListener(Ie,this.handleKeydown)}handleFocusout(e){this.contains(e.target)||(this.isActiveRow=!1,this.focusColumnIndex=0)}handleCellFocus(e){this.isActiveRow=!0,this.focusColumnIndex=this.cellElements.indexOf(e.target),this.$emit("row-focused",this)}handleKeydown(e){if(e.defaultPrevented)return;let t=0;switch(e.key){case Ve:t=Math.max(0,this.focusColumnIndex-1),this.cellElements[t].focus(),e.preventDefault();break;case Ne:t=Math.min(this.cellElements.length-1,this.focusColumnIndex+1),this.cellElements[t].focus(),e.preventDefault();break;case ne:e.ctrlKey||(this.cellElements[0].focus(),e.preventDefault());break;case se:e.ctrlKey||(this.cellElements[this.cellElements.length-1].focus(),e.preventDefault());break}}updateItemTemplate(){this.activeCellItemTemplate=this.rowType===Ue.default&&this.cellItemTemplate!==void 0?this.cellItemTemplate:this.rowType===Ue.default&&this.cellItemTemplate===void 0?this.defaultCellItemTemplate:this.headerCellItemTemplate!==void 0?this.headerCellItemTemplate:this.defaultHeaderCellItemTemplate}};l([h({attribute:"grid-template-columns"})],M.prototype,"gridTemplateColumns",void 0);l([h({attribute:"row-type"})],M.prototype,"rowType",void 0);l([f],M.prototype,"rowData",void 0);l([f],M.prototype,"columnDefinitions",void 0);l([f],M.prototype,"cellItemTemplate",void 0);l([f],M.prototype,"headerCellItemTemplate",void 0);l([f],M.prototype,"rowIndex",void 0);l([f],M.prototype,"isActiveRow",void 0);l([f],M.prototype,"activeCellItemTemplate",void 0);l([f],M.prototype,"defaultCellItemTemplate",void 0);l([f],M.prototype,"defaultHeaderCellItemTemplate",void 0);l([f],M.prototype,"cellElements",void 0);function pa(o){let e=o.tagFor(M);return x`
    <${e}
        :rowData="${t=>t}"
        :cellItemTemplate="${(t,i)=>i.parent.cellItemTemplate}"
        :headerCellItemTemplate="${(t,i)=>i.parent.headerCellItemTemplate}"
    ></${e}>
`}var Wr=(o,e)=>{let t=pa(o),i=o.tagFor(M);return x`
        <template
            role="grid"
            tabindex="0"
            :rowElementTag="${()=>i}"
            :defaultRowItemTemplate="${t}"
            ${Xt({property:"rowElements",filter:Je("[role=row]")})}
        >
            <slot></slot>
        </template>
    `};var V=class o extends k{constructor(){super(),this.noTabbing=!1,this.generateHeader=gt.default,this.rowsData=[],this.columnDefinitions=null,this.focusRowIndex=0,this.focusColumnIndex=0,this.rowsPlaceholder=null,this.generatedHeader=null,this.isUpdatingFocus=!1,this.pendingFocusUpdate=!1,this.rowindexUpdateQueued=!1,this.columnDefinitionsStale=!0,this.generatedGridTemplateColumns="",this.focusOnCell=(e,t,i)=>{if(this.rowElements.length===0){this.focusRowIndex=0,this.focusColumnIndex=0;return}let r=Math.max(0,Math.min(this.rowElements.length-1,e)),s=this.rowElements[r].querySelectorAll('[role="cell"], [role="gridcell"], [role="columnheader"], [role="rowheader"]'),a=Math.max(0,Math.min(s.length-1,t)),c=s[a];i&&this.scrollHeight!==this.clientHeight&&(r<this.focusRowIndex&&this.scrollTop>0||r>this.focusRowIndex&&this.scrollTop<this.scrollHeight-this.clientHeight)&&c.scrollIntoView({block:"center",inline:"center"}),c.focus()},this.onChildListChange=(e,t)=>{e&&e.length&&(e.forEach(i=>{i.addedNodes.forEach(r=>{r.nodeType===1&&r.getAttribute("role")==="row"&&(r.columnDefinitions=this.columnDefinitions)})}),this.queueRowIndexUpdate())},this.queueRowIndexUpdate=()=>{this.rowindexUpdateQueued||(this.rowindexUpdateQueued=!0,v.queueUpdate(this.updateRowIndexes))},this.updateRowIndexes=()=>{let e=this.gridTemplateColumns;if(e===void 0){if(this.generatedGridTemplateColumns===""&&this.rowElements.length>0){let t=this.rowElements[0];this.generatedGridTemplateColumns=new Array(t.cellElements.length).fill("1fr").join(" ")}e=this.generatedGridTemplateColumns}this.rowElements.forEach((t,i)=>{let r=t;r.rowIndex=i,r.gridTemplateColumns=e,this.columnDefinitionsStale&&(r.columnDefinitions=this.columnDefinitions)}),this.rowindexUpdateQueued=!1,this.columnDefinitionsStale=!1}}static generateTemplateColumns(e){let t="";return e.forEach(i=>{t=`${t}${t===""?"":" "}1fr`}),t}noTabbingChanged(){this.$fastController.isConnected&&(this.noTabbing?this.setAttribute("tabIndex","-1"):this.setAttribute("tabIndex",this.contains(document.activeElement)||this===document.activeElement?"-1":"0"))}generateHeaderChanged(){this.$fastController.isConnected&&this.toggleGeneratedHeader()}gridTemplateColumnsChanged(){this.$fastController.isConnected&&this.updateRowIndexes()}rowsDataChanged(){this.columnDefinitions===null&&this.rowsData.length>0&&(this.columnDefinitions=o.generateColumns(this.rowsData[0])),this.$fastController.isConnected&&this.toggleGeneratedHeader()}columnDefinitionsChanged(){if(this.columnDefinitions===null){this.generatedGridTemplateColumns="";return}this.generatedGridTemplateColumns=o.generateTemplateColumns(this.columnDefinitions),this.$fastController.isConnected&&(this.columnDefinitionsStale=!0,this.queueRowIndexUpdate())}headerCellItemTemplateChanged(){this.$fastController.isConnected&&this.generatedHeader!==null&&(this.generatedHeader.headerCellItemTemplate=this.headerCellItemTemplate)}focusRowIndexChanged(){this.$fastController.isConnected&&this.queueFocusUpdate()}focusColumnIndexChanged(){this.$fastController.isConnected&&this.queueFocusUpdate()}connectedCallback(){super.connectedCallback(),this.rowItemTemplate===void 0&&(this.rowItemTemplate=this.defaultRowItemTemplate),this.rowsPlaceholder=document.createComment(""),this.appendChild(this.rowsPlaceholder),this.toggleGeneratedHeader(),this.rowsRepeatBehavior=new ut(e=>e.rowsData,e=>e.rowItemTemplate,{positioning:!0}).createBehavior(this.rowsPlaceholder),this.$fastController.addBehaviors([this.rowsRepeatBehavior]),this.addEventListener("row-focused",this.handleRowFocus),this.addEventListener(oi,this.handleFocus),this.addEventListener(Ie,this.handleKeydown),this.addEventListener(Te,this.handleFocusOut),this.observer=new MutationObserver(this.onChildListChange),this.observer.observe(this,{childList:!0}),this.noTabbing&&this.setAttribute("tabindex","-1"),v.queueUpdate(this.queueRowIndexUpdate)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("row-focused",this.handleRowFocus),this.removeEventListener(oi,this.handleFocus),this.removeEventListener(Ie,this.handleKeydown),this.removeEventListener(Te,this.handleFocusOut),this.observer.disconnect(),this.rowsPlaceholder=null,this.generatedHeader=null}handleRowFocus(e){this.isUpdatingFocus=!0;let t=e.target;this.focusRowIndex=this.rowElements.indexOf(t),this.focusColumnIndex=t.focusColumnIndex,this.setAttribute("tabIndex","-1"),this.isUpdatingFocus=!1}handleFocus(e){this.focusOnCell(this.focusRowIndex,this.focusColumnIndex,!0)}handleFocusOut(e){(e.relatedTarget===null||!this.contains(e.relatedTarget))&&this.setAttribute("tabIndex",this.noTabbing?"-1":"0")}handleKeydown(e){if(e.defaultPrevented)return;let t,i=this.rowElements.length-1,r=this.offsetHeight+this.scrollTop,n=this.rowElements[i];switch(e.key){case ee:e.preventDefault(),this.focusOnCell(this.focusRowIndex-1,this.focusColumnIndex,!0);break;case K:e.preventDefault(),this.focusOnCell(this.focusRowIndex+1,this.focusColumnIndex,!0);break;case Lr:if(e.preventDefault(),this.rowElements.length===0){this.focusOnCell(0,0,!1);break}if(this.focusRowIndex===0){this.focusOnCell(0,this.focusColumnIndex,!1);return}for(t=this.focusRowIndex-1,t;t>=0;t--){let s=this.rowElements[t];if(s.offsetTop<this.scrollTop){this.scrollTop=s.offsetTop+s.clientHeight-this.clientHeight;break}}this.focusOnCell(t,this.focusColumnIndex,!1);break;case _r:if(e.preventDefault(),this.rowElements.length===0){this.focusOnCell(0,0,!1);break}if(this.focusRowIndex>=i||n.offsetTop+n.offsetHeight<=r){this.focusOnCell(i,this.focusColumnIndex,!1);return}for(t=this.focusRowIndex+1,t;t<=i;t++){let s=this.rowElements[t];if(s.offsetTop+s.offsetHeight>r){let a=0;this.generateHeader===gt.sticky&&this.generatedHeader!==null&&(a=this.generatedHeader.clientHeight),this.scrollTop=s.offsetTop-a;break}}this.focusOnCell(t,this.focusColumnIndex,!1);break;case ne:e.ctrlKey&&(e.preventDefault(),this.focusOnCell(0,0,!0));break;case se:e.ctrlKey&&this.columnDefinitions!==null&&(e.preventDefault(),this.focusOnCell(this.rowElements.length-1,this.columnDefinitions.length-1,!0));break}}queueFocusUpdate(){this.isUpdatingFocus&&(this.contains(document.activeElement)||this===document.activeElement)||this.pendingFocusUpdate===!1&&(this.pendingFocusUpdate=!0,v.queueUpdate(()=>this.updateFocus()))}updateFocus(){this.pendingFocusUpdate=!1,this.focusOnCell(this.focusRowIndex,this.focusColumnIndex,!0)}toggleGeneratedHeader(){if(this.generatedHeader!==null&&(this.removeChild(this.generatedHeader),this.generatedHeader=null),this.generateHeader!==gt.none&&this.rowsData.length>0){let e=document.createElement(this.rowElementTag);this.generatedHeader=e,this.generatedHeader.columnDefinitions=this.columnDefinitions,this.generatedHeader.gridTemplateColumns=this.gridTemplateColumns,this.generatedHeader.rowType=this.generateHeader===gt.sticky?Ue.stickyHeader:Ue.header,(this.firstChild!==null||this.rowsPlaceholder!==null)&&this.insertBefore(e,this.firstChild!==null?this.firstChild:this.rowsPlaceholder);return}}};V.generateColumns=o=>Object.getOwnPropertyNames(o).map((e,t)=>({columnDataKey:e,gridColumn:`${t}`}));l([h({attribute:"no-tabbing",mode:"boolean"})],V.prototype,"noTabbing",void 0);l([h({attribute:"generate-header"})],V.prototype,"generateHeader",void 0);l([h({attribute:"grid-template-columns"})],V.prototype,"gridTemplateColumns",void 0);l([f],V.prototype,"rowsData",void 0);l([f],V.prototype,"columnDefinitions",void 0);l([f],V.prototype,"rowItemTemplate",void 0);l([f],V.prototype,"cellItemTemplate",void 0);l([f],V.prototype,"headerCellItemTemplate",void 0);l([f],V.prototype,"focusRowIndex",void 0);l([f],V.prototype,"focusColumnIndex",void 0);l([f],V.prototype,"defaultRowItemTemplate",void 0);l([f],V.prototype,"rowElementTag",void 0);l([f],V.prototype,"rowElements",void 0);var fa=x`
    <template>
        ${o=>o.rowData===null||o.columnDefinition===null||o.columnDefinition.columnDataKey===null?null:o.rowData[o.columnDefinition.columnDataKey]}
    </template>
`,ma=x`
    <template>
        ${o=>o.columnDefinition===null?null:o.columnDefinition.title===void 0?o.columnDefinition.columnDataKey:o.columnDefinition.title}
    </template>
`,ae=class extends k{constructor(){super(...arguments),this.cellType=xe.default,this.rowData=null,this.columnDefinition=null,this.isActiveCell=!1,this.customCellView=null,this.updateCellStyle=()=>{this.style.gridColumn=this.gridColumn}}cellTypeChanged(){this.$fastController.isConnected&&this.updateCellView()}gridColumnChanged(){this.$fastController.isConnected&&this.updateCellStyle()}columnDefinitionChanged(e,t){this.$fastController.isConnected&&this.updateCellView()}connectedCallback(){var e;super.connectedCallback(),this.addEventListener(ii,this.handleFocusin),this.addEventListener(Te,this.handleFocusout),this.addEventListener(Ie,this.handleKeydown),this.style.gridColumn=`${((e=this.columnDefinition)===null||e===void 0?void 0:e.gridColumn)===void 0?0:this.columnDefinition.gridColumn}`,this.updateCellView(),this.updateCellStyle()}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener(ii,this.handleFocusin),this.removeEventListener(Te,this.handleFocusout),this.removeEventListener(Ie,this.handleKeydown),this.disconnectCellView()}handleFocusin(e){if(!this.isActiveCell){switch(this.isActiveCell=!0,this.cellType){case xe.columnHeader:if(this.columnDefinition!==null&&this.columnDefinition.headerCellInternalFocusQueue!==!0&&typeof this.columnDefinition.headerCellFocusTargetCallback=="function"){let t=this.columnDefinition.headerCellFocusTargetCallback(this);t!==null&&t.focus()}break;default:if(this.columnDefinition!==null&&this.columnDefinition.cellInternalFocusQueue!==!0&&typeof this.columnDefinition.cellFocusTargetCallback=="function"){let t=this.columnDefinition.cellFocusTargetCallback(this);t!==null&&t.focus()}break}this.$emit("cell-focused",this)}}handleFocusout(e){this!==document.activeElement&&!this.contains(document.activeElement)&&(this.isActiveCell=!1)}handleKeydown(e){if(!(e.defaultPrevented||this.columnDefinition===null||this.cellType===xe.default&&this.columnDefinition.cellInternalFocusQueue!==!0||this.cellType===xe.columnHeader&&this.columnDefinition.headerCellInternalFocusQueue!==!0))switch(e.key){case ge:case Br:if(this.contains(document.activeElement)&&document.activeElement!==this)return;switch(this.cellType){case xe.columnHeader:if(this.columnDefinition.headerCellFocusTargetCallback!==void 0){let t=this.columnDefinition.headerCellFocusTargetCallback(this);t!==null&&t.focus(),e.preventDefault()}break;default:if(this.columnDefinition.cellFocusTargetCallback!==void 0){let t=this.columnDefinition.cellFocusTargetCallback(this);t!==null&&t.focus(),e.preventDefault()}break}break;case ze:this.contains(document.activeElement)&&document.activeElement!==this&&(this.focus(),e.preventDefault());break}}updateCellView(){if(this.disconnectCellView(),this.columnDefinition!==null)switch(this.cellType){case xe.columnHeader:this.columnDefinition.headerCellTemplate!==void 0?this.customCellView=this.columnDefinition.headerCellTemplate.render(this,this):this.customCellView=ma.render(this,this);break;case void 0:case xe.rowHeader:case xe.default:this.columnDefinition.cellTemplate!==void 0?this.customCellView=this.columnDefinition.cellTemplate.render(this,this):this.customCellView=fa.render(this,this);break}}disconnectCellView(){this.customCellView!==null&&(this.customCellView.dispose(),this.customCellView=null)}};l([h({attribute:"cell-type"})],ae.prototype,"cellType",void 0);l([h({attribute:"grid-column"})],ae.prototype,"gridColumn",void 0);l([f],ae.prototype,"rowData",void 0);l([f],ae.prototype,"columnDefinition",void 0);function ba(o){let e=o.tagFor(ae);return x`
    <${e}
        cell-type="${t=>t.isRowHeader?"rowheader":void 0}"
        grid-column="${(t,i)=>i.index+1}"
        :rowData="${(t,i)=>i.parent.rowData}"
        :columnDefinition="${t=>t}"
    ></${e}>
`}function ga(o){let e=o.tagFor(ae);return x`
    <${e}
        cell-type="columnheader"
        grid-column="${(t,i)=>i.index+1}"
        :columnDefinition="${t=>t}"
    ></${e}>
`}var Qr=(o,e)=>{let t=ba(o),i=ga(o);return x`
        <template
            role="row"
            class="${r=>r.rowType!=="default"?r.rowType:""}"
            :defaultCellItemTemplate="${t}"
            :defaultHeaderCellItemTemplate="${i}"
            ${Xt({property:"cellElements",filter:Je('[role="cell"],[role="gridcell"],[role="columnheader"],[role="rowheader"]')})}
        >
            <slot ${B("slottedCellElements")}></slot>
        </template>
    `};var Xr=(o,e)=>x`
        <template
            tabindex="-1"
            role="${t=>!t.cellType||t.cellType==="default"?"gridcell":t.cellType}"
            class="
            ${t=>t.cellType==="columnheader"?"column-header":t.cellType==="rowheader"?"row-header":""}
            "
        >
            <slot></slot>
        </template>
    `;var Yr=(o,e)=>x`
    <template
        role="checkbox"
        aria-checked="${t=>t.checked}"
        aria-required="${t=>t.required}"
        aria-disabled="${t=>t.disabled}"
        aria-readonly="${t=>t.readOnly}"
        tabindex="${t=>t.disabled?null:0}"
        @keypress="${(t,i)=>t.keypressHandler(i.event)}"
        @click="${(t,i)=>t.clickHandler(i.event)}"
        class="${t=>t.readOnly?"readonly":""} ${t=>t.checked?"checked":""} ${t=>t.indeterminate?"indeterminate":""}"
    >
        <div part="control" class="control">
            <slot name="checked-indicator">
                ${e.checkedIndicator||""}
            </slot>
            <slot name="indeterminate-indicator">
                ${e.indeterminateIndicator||""}
            </slot>
        </div>
        <label
            part="label"
            class="${t=>t.defaultSlottedNodes&&t.defaultSlottedNodes.length?"label":"label label__hidden"}"
        >
            <slot ${B("defaultSlottedNodes")}></slot>
        </label>
    </template>
`;var ni=class extends k{},so=class extends ro(ni){constructor(){super(...arguments),this.proxy=document.createElement("input")}};var ot=class extends so{constructor(){super(),this.initialValue="on",this.indeterminate=!1,this.keypressHandler=e=>{if(!this.readOnly)switch(e.key){case ve:this.indeterminate&&(this.indeterminate=!1),this.checked=!this.checked;break}},this.clickHandler=e=>{!this.disabled&&!this.readOnly&&(this.indeterminate&&(this.indeterminate=!1),this.checked=!this.checked)},this.proxy.setAttribute("type","checkbox")}readOnlyChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.readOnly=this.readOnly)}};l([h({attribute:"readonly",mode:"boolean"})],ot.prototype,"readOnly",void 0);l([f],ot.prototype,"defaultSlottedNodes",void 0);l([f],ot.prototype,"indeterminate",void 0);function si(o){return Dr(o)&&(o.getAttribute("role")==="option"||o instanceof HTMLOptionElement)}var le=class extends k{constructor(e,t,i,r){super(),this.defaultSelected=!1,this.dirtySelected=!1,this.selected=this.defaultSelected,this.dirtyValue=!1,e&&(this.textContent=e),t&&(this.initialValue=t),i&&(this.defaultSelected=i),r&&(this.selected=r),this.proxy=new Option(`${this.textContent}`,this.initialValue,this.defaultSelected,this.selected),this.proxy.disabled=this.disabled}checkedChanged(e,t){if(typeof t=="boolean"){this.ariaChecked=t?"true":"false";return}this.ariaChecked=null}contentChanged(e,t){this.proxy instanceof HTMLOptionElement&&(this.proxy.textContent=this.textContent),this.$emit("contentchange",null,{bubbles:!0})}defaultSelectedChanged(){this.dirtySelected||(this.selected=this.defaultSelected,this.proxy instanceof HTMLOptionElement&&(this.proxy.selected=this.defaultSelected))}disabledChanged(e,t){this.ariaDisabled=this.disabled?"true":"false",this.proxy instanceof HTMLOptionElement&&(this.proxy.disabled=this.disabled)}selectedAttributeChanged(){this.defaultSelected=this.selectedAttribute,this.proxy instanceof HTMLOptionElement&&(this.proxy.defaultSelected=this.defaultSelected)}selectedChanged(){this.ariaSelected=this.selected?"true":"false",this.dirtySelected||(this.dirtySelected=!0),this.proxy instanceof HTMLOptionElement&&(this.proxy.selected=this.selected)}initialValueChanged(e,t){this.dirtyValue||(this.value=this.initialValue,this.dirtyValue=!1)}get label(){var e;return(e=this.value)!==null&&e!==void 0?e:this.text}get text(){var e,t;return(t=(e=this.textContent)===null||e===void 0?void 0:e.replace(/\s+/g," ").trim())!==null&&t!==void 0?t:""}set value(e){let t=`${e??""}`;this._value=t,this.dirtyValue=!0,this.proxy instanceof HTMLOptionElement&&(this.proxy.value=t),y.notify(this,"value")}get value(){var e;return y.track(this,"value"),(e=this._value)!==null&&e!==void 0?e:this.text}get form(){return this.proxy?this.proxy.form:null}};l([f],le.prototype,"checked",void 0);l([f],le.prototype,"content",void 0);l([f],le.prototype,"defaultSelected",void 0);l([h({mode:"boolean"})],le.prototype,"disabled",void 0);l([h({attribute:"selected",mode:"boolean"})],le.prototype,"selectedAttribute",void 0);l([f],le.prototype,"selected",void 0);l([h({attribute:"value",mode:"fromView"})],le.prototype,"initialValue",void 0);var Ge=class{};l([f],Ge.prototype,"ariaChecked",void 0);l([f],Ge.prototype,"ariaPosInSet",void 0);l([f],Ge.prototype,"ariaSelected",void 0);l([f],Ge.prototype,"ariaSetSize",void 0);L(Ge,S);L(le,X,Ge);var j=class o extends k{constructor(){super(...arguments),this._options=[],this.selectedIndex=-1,this.selectedOptions=[],this.shouldSkipFocus=!1,this.typeaheadBuffer="",this.typeaheadExpired=!0,this.typeaheadTimeout=-1}get firstSelectedOption(){var e;return(e=this.selectedOptions[0])!==null&&e!==void 0?e:null}get hasSelectableOptions(){return this.options.length>0&&!this.options.every(e=>e.disabled)}get length(){var e,t;return(t=(e=this.options)===null||e===void 0?void 0:e.length)!==null&&t!==void 0?t:0}get options(){return y.track(this,"options"),this._options}set options(e){this._options=e,y.notify(this,"options")}get typeAheadExpired(){return this.typeaheadExpired}set typeAheadExpired(e){this.typeaheadExpired=e}clickHandler(e){let t=e.target.closest("option,[role=option]");if(t&&!t.disabled)return this.selectedIndex=this.options.indexOf(t),!0}focusAndScrollOptionIntoView(e=this.firstSelectedOption){this.contains(document.activeElement)&&e!==null&&(e.focus(),requestAnimationFrame(()=>{e.scrollIntoView({block:"nearest"})}))}focusinHandler(e){!this.shouldSkipFocus&&e.target===e.currentTarget&&(this.setSelectedOptions(),this.focusAndScrollOptionIntoView()),this.shouldSkipFocus=!1}getTypeaheadMatches(){let e=this.typeaheadBuffer.replace(/[.*+\-?^${}()|[\]\\]/g,"\\$&"),t=new RegExp(`^${e}`,"gi");return this.options.filter(i=>i.text.trim().match(t))}getSelectableIndex(e=this.selectedIndex,t){let i=e>t?-1:e<t?1:0,r=e+i,n=null;switch(i){case-1:{n=this.options.reduceRight((s,a,c)=>!s&&!a.disabled&&c<r?a:s,n);break}case 1:{n=this.options.reduce((s,a,c)=>!s&&!a.disabled&&c>r?a:s,n);break}}return this.options.indexOf(n)}handleChange(e,t){switch(t){case"selected":{o.slottedOptionFilter(e)&&(this.selectedIndex=this.options.indexOf(e)),this.setSelectedOptions();break}}}handleTypeAhead(e){this.typeaheadTimeout&&window.clearTimeout(this.typeaheadTimeout),this.typeaheadTimeout=window.setTimeout(()=>this.typeaheadExpired=!0,o.TYPE_AHEAD_TIMEOUT_MS),!(e.length>1)&&(this.typeaheadBuffer=`${this.typeaheadExpired?"":this.typeaheadBuffer}${e}`)}keydownHandler(e){if(this.disabled)return!0;this.shouldSkipFocus=!1;let t=e.key;switch(t){case ne:{e.shiftKey||(e.preventDefault(),this.selectFirstOption());break}case K:{e.shiftKey||(e.preventDefault(),this.selectNextOption());break}case ee:{e.shiftKey||(e.preventDefault(),this.selectPreviousOption());break}case se:{e.preventDefault(),this.selectLastOption();break}case mt:return this.focusAndScrollOptionIntoView(),!0;case ge:case ze:return!0;case ve:if(this.typeaheadExpired)return!0;default:return t.length===1&&this.handleTypeAhead(`${t}`),!0}}mousedownHandler(e){return this.shouldSkipFocus=!this.contains(document.activeElement),!0}multipleChanged(e,t){this.ariaMultiSelectable=t?"true":null}selectedIndexChanged(e,t){var i;if(!this.hasSelectableOptions){this.selectedIndex=-1;return}if(!((i=this.options[this.selectedIndex])===null||i===void 0)&&i.disabled&&typeof e=="number"){let r=this.getSelectableIndex(e,t),n=r>-1?r:e;this.selectedIndex=n,t===n&&this.selectedIndexChanged(t,n);return}this.setSelectedOptions()}selectedOptionsChanged(e,t){var i;let r=t.filter(o.slottedOptionFilter);(i=this.options)===null||i===void 0||i.forEach(n=>{let s=y.getNotifier(n);s.unsubscribe(this,"selected"),n.selected=r.includes(n),s.subscribe(this,"selected")})}selectFirstOption(){var e,t;this.disabled||(this.selectedIndex=(t=(e=this.options)===null||e===void 0?void 0:e.findIndex(i=>!i.disabled))!==null&&t!==void 0?t:-1)}selectLastOption(){this.disabled||(this.selectedIndex=Ar(this.options,e=>!e.disabled))}selectNextOption(){!this.disabled&&this.selectedIndex<this.options.length-1&&(this.selectedIndex+=1)}selectPreviousOption(){!this.disabled&&this.selectedIndex>0&&(this.selectedIndex=this.selectedIndex-1)}setDefaultSelectedOption(){var e,t;this.selectedIndex=(t=(e=this.options)===null||e===void 0?void 0:e.findIndex(i=>i.defaultSelected))!==null&&t!==void 0?t:-1}setSelectedOptions(){var e,t,i;!((e=this.options)===null||e===void 0)&&e.length&&(this.selectedOptions=[this.options[this.selectedIndex]],this.ariaActiveDescendant=(i=(t=this.firstSelectedOption)===null||t===void 0?void 0:t.id)!==null&&i!==void 0?i:"",this.focusAndScrollOptionIntoView())}slottedOptionsChanged(e,t){this.options=t.reduce((r,n)=>(si(n)&&r.push(n),r),[]);let i=`${this.options.length}`;this.options.forEach((r,n)=>{r.id||(r.id=tt("option-")),r.ariaPosInSet=`${n+1}`,r.ariaSetSize=i}),this.$fastController.isConnected&&(this.setSelectedOptions(),this.setDefaultSelectedOption())}typeaheadBufferChanged(e,t){if(this.$fastController.isConnected){let i=this.getTypeaheadMatches();if(i.length){let r=this.options.indexOf(i[0]);r>-1&&(this.selectedIndex=r)}this.typeaheadExpired=!1}}};j.slottedOptionFilter=o=>si(o)&&!o.hidden;j.TYPE_AHEAD_TIMEOUT_MS=1e3;l([h({mode:"boolean"})],j.prototype,"disabled",void 0);l([f],j.prototype,"selectedIndex",void 0);l([f],j.prototype,"selectedOptions",void 0);l([f],j.prototype,"slottedOptions",void 0);l([f],j.prototype,"typeaheadBuffer",void 0);var ye=class{};l([f],ye.prototype,"ariaActiveDescendant",void 0);l([f],ye.prototype,"ariaDisabled",void 0);l([f],ye.prototype,"ariaExpanded",void 0);l([f],ye.prototype,"ariaMultiSelectable",void 0);L(ye,S);L(j,ye);var Dt={above:"above",below:"below"};function Pt(o){let e=o.parentElement;if(e)return e;{let t=o.getRootNode();if(t.host instanceof HTMLElement)return t.host}return null}function Zr(o,e){let t=e;for(;t!==null;){if(t===o)return!0;t=Pt(t)}return!1}var we=document.createElement("div");function va(o){return o instanceof Me}var Ft=class{setProperty(e,t){v.queueUpdate(()=>this.target.setProperty(e,t))}removeProperty(e){v.queueUpdate(()=>this.target.removeProperty(e))}},li=class extends Ft{constructor(e){super();let t=new CSSStyleSheet;t[qt]=!0,this.target=t.cssRules[t.insertRule(":host{}")].style,e.$fastController.addStyles(H.create([t]))}},ci=class extends Ft{constructor(){super();let e=new CSSStyleSheet;this.target=e.cssRules[e.insertRule(":root{}")].style,document.adoptedStyleSheets=[...document.adoptedStyleSheets,e]}},di=class extends Ft{constructor(){super(),this.style=document.createElement("style"),document.head.appendChild(this.style);let{sheet:e}=this.style;if(e){let t=e.insertRule(":root{}",e.cssRules.length);this.target=e.cssRules[t].style}}},ao=class{constructor(e){this.store=new Map,this.target=null;let t=e.$fastController;this.style=document.createElement("style"),t.addStyles(this.style),y.getNotifier(t).subscribe(this,"isConnected"),this.handleChange(t,"isConnected")}targetChanged(){if(this.target!==null)for(let[e,t]of this.store.entries())this.target.setProperty(e,t)}setProperty(e,t){this.store.set(e,t),v.queueUpdate(()=>{this.target!==null&&this.target.setProperty(e,t)})}removeProperty(e){this.store.delete(e),v.queueUpdate(()=>{this.target!==null&&this.target.removeProperty(e)})}handleChange(e,t){let{sheet:i}=this.style;if(i){let r=i.insertRule(":host{}",i.cssRules.length);this.target=i.cssRules[r].style}else this.target=null}};l([f],ao.prototype,"target",void 0);var hi=class{constructor(e){this.target=e.style}setProperty(e,t){v.queueUpdate(()=>this.target.setProperty(e,t))}removeProperty(e){v.queueUpdate(()=>this.target.removeProperty(e))}},qe=class o{setProperty(e,t){o.properties[e]=t;for(let i of o.roots.values())it.getOrCreate(o.normalizeRoot(i)).setProperty(e,t)}removeProperty(e){delete o.properties[e];for(let t of o.roots.values())it.getOrCreate(o.normalizeRoot(t)).removeProperty(e)}static registerRoot(e){let{roots:t}=o;if(!t.has(e)){t.add(e);let i=it.getOrCreate(this.normalizeRoot(e));for(let r in o.properties)i.setProperty(r,o.properties[r])}}static unregisterRoot(e){let{roots:t}=o;if(t.has(e)){t.delete(e);let i=it.getOrCreate(o.normalizeRoot(e));for(let r in o.properties)i.removeProperty(r)}}static normalizeRoot(e){return e===we?document:e}};qe.roots=new Set;qe.properties={};var ai=new WeakMap,xa=v.supportsAdoptedStyleSheets?li:ao,it=Object.freeze({getOrCreate(o){if(ai.has(o))return ai.get(o);let e;return o===we?e=new qe:o instanceof Document?e=v.supportsAdoptedStyleSheets?new ci:new di:va(o)?e=new xa(o):e=new hi(o),ai.set(o,e),e}});var he=class o extends Ze{constructor(e){super(),this.subscribers=new WeakMap,this._appliedTo=new Set,this.name=e.name,e.cssCustomPropertyName!==null&&(this.cssCustomProperty=`--${e.cssCustomPropertyName}`,this.cssVar=`var(${this.cssCustomProperty})`),this.id=o.uniqueId(),o.tokensById.set(this.id,this)}get appliedTo(){return[...this._appliedTo]}static from(e){return new o({name:typeof e=="string"?e:e.name,cssCustomPropertyName:typeof e=="string"?e:e.cssCustomPropertyName===void 0?e.name:e.cssCustomPropertyName})}static isCSSDesignToken(e){return typeof e.cssCustomProperty=="string"}static isDerivedDesignTokenValue(e){return typeof e=="function"}static getTokenById(e){return o.tokensById.get(e)}getOrCreateSubscriberSet(e=this){return this.subscribers.get(e)||this.subscribers.set(e,new Set)&&this.subscribers.get(e)}createCSS(){return this.cssVar||""}getValueFor(e){let t=W.getOrCreate(e).get(this);if(t!==void 0)return t;throw new Error(`Value could not be retrieved for token named "${this.name}". Ensure the value is set for ${e} or an ancestor of ${e}.`)}setValueFor(e,t){return this._appliedTo.add(e),t instanceof o&&(t=this.alias(t)),W.getOrCreate(e).set(this,t),this}deleteValueFor(e){return this._appliedTo.delete(e),W.existsFor(e)&&W.getOrCreate(e).delete(this),this}withDefault(e){return this.setValueFor(we,e),this}subscribe(e,t){let i=this.getOrCreateSubscriberSet(t);t&&!W.existsFor(t)&&W.getOrCreate(t),i.has(e)||i.add(e)}unsubscribe(e,t){let i=this.subscribers.get(t||this);i&&i.has(e)&&i.delete(e)}notify(e){let t=Object.freeze({token:this,target:e});this.subscribers.has(this)&&this.subscribers.get(this).forEach(i=>i.handleChange(t)),this.subscribers.has(e)&&this.subscribers.get(e).forEach(i=>i.handleChange(t))}alias(e){return t=>e.getValueFor(t)}};he.uniqueId=(()=>{let o=0;return()=>(o++,o.toString(16))})();he.tokensById=new Map;var ui=class{startReflection(e,t){e.subscribe(this,t),this.handleChange({token:e,target:t})}stopReflection(e,t){e.unsubscribe(this,t),this.remove(e,t)}handleChange(e){let{token:t,target:i}=e;this.add(t,i)}add(e,t){it.getOrCreate(t).setProperty(e.cssCustomProperty,this.resolveCSSValue(W.getOrCreate(t).get(e)))}remove(e,t){it.getOrCreate(t).removeProperty(e.cssCustomProperty)}resolveCSSValue(e){return e&&typeof e.createCSS=="function"?e.createCSS():e}},pi=class{constructor(e,t,i){this.source=e,this.token=t,this.node=i,this.dependencies=new Set,this.observer=y.binding(e,this,!1),this.observer.handleChange=this.observer.call,this.handleChange()}disconnect(){this.observer.disconnect()}handleChange(){try{this.node.store.set(this.token,this.observer.observe(this.node.target,_e))}catch(e){console.error(e)}}},fi=class{constructor(){this.values=new Map}set(e,t){this.values.get(e)!==t&&(this.values.set(e,t),y.getNotifier(this).notify(e.id))}get(e){return y.track(this,e.id),this.values.get(e)}delete(e){this.values.delete(e),y.getNotifier(this).notify(e.id)}all(){return this.values.entries()}},Bt=new WeakMap,_t=new WeakMap,W=class o{constructor(e){this.target=e,this.store=new fi,this.children=[],this.assignedValues=new Map,this.reflecting=new Set,this.bindingObservers=new Map,this.tokenValueChangeHandler={handleChange:(t,i)=>{let r=he.getTokenById(i);r&&(r.notify(this.target),this.updateCSSTokenReflection(t,r))}},Bt.set(e,this),y.getNotifier(this.store).subscribe(this.tokenValueChangeHandler),e instanceof Me?e.$fastController.addBehaviors([this]):e.isConnected&&this.bind()}static getOrCreate(e){return Bt.get(e)||new o(e)}static existsFor(e){return Bt.has(e)}static findParent(e){if(we!==e.target){let t=Pt(e.target);for(;t!==null;){if(Bt.has(t))return Bt.get(t);t=Pt(t)}return o.getOrCreate(we)}return null}static findClosestAssignedNode(e,t){let i=t;do{if(i.has(e))return i;i=i.parent?i.parent:i.target!==we?o.getOrCreate(we):null}while(i!==null);return null}get parent(){return _t.get(this)||null}updateCSSTokenReflection(e,t){if(he.isCSSDesignToken(t)){let i=this.parent,r=this.isReflecting(t);if(i){let n=i.get(t),s=e.get(t);n!==s&&!r?this.reflectToCSS(t):n===s&&r&&this.stopReflectToCSS(t)}else r||this.reflectToCSS(t)}}has(e){return this.assignedValues.has(e)}get(e){let t=this.store.get(e);if(t!==void 0)return t;let i=this.getRaw(e);if(i!==void 0)return this.hydrate(e,i),this.get(e)}getRaw(e){var t;return this.assignedValues.has(e)?this.assignedValues.get(e):(t=o.findClosestAssignedNode(e,this))===null||t===void 0?void 0:t.getRaw(e)}set(e,t){he.isDerivedDesignTokenValue(this.assignedValues.get(e))&&this.tearDownBindingObserver(e),this.assignedValues.set(e,t),he.isDerivedDesignTokenValue(t)?this.setupBindingObserver(e,t):this.store.set(e,t)}delete(e){this.assignedValues.delete(e),this.tearDownBindingObserver(e);let t=this.getRaw(e);t?this.hydrate(e,t):this.store.delete(e)}bind(){let e=o.findParent(this);e&&e.appendChild(this);for(let t of this.assignedValues.keys())t.notify(this.target)}unbind(){this.parent&&_t.get(this).removeChild(this);for(let e of this.bindingObservers.keys())this.tearDownBindingObserver(e)}appendChild(e){e.parent&&_t.get(e).removeChild(e);let t=this.children.filter(i=>e.contains(i));_t.set(e,this),this.children.push(e),t.forEach(i=>e.appendChild(i)),y.getNotifier(this.store).subscribe(e);for(let[i,r]of this.store.all())e.hydrate(i,this.bindingObservers.has(i)?this.getRaw(i):r),e.updateCSSTokenReflection(e.store,i)}removeChild(e){let t=this.children.indexOf(e);if(t!==-1&&this.children.splice(t,1),y.getNotifier(this.store).unsubscribe(e),e.parent!==this)return!1;let i=_t.delete(e);for(let[r]of this.store.all())e.hydrate(r,e.getRaw(r)),e.updateCSSTokenReflection(e.store,r);return i}contains(e){return Zr(this.target,e.target)}reflectToCSS(e){this.isReflecting(e)||(this.reflecting.add(e),o.cssCustomPropertyReflector.startReflection(e,this.target))}stopReflectToCSS(e){this.isReflecting(e)&&(this.reflecting.delete(e),o.cssCustomPropertyReflector.stopReflection(e,this.target))}isReflecting(e){return this.reflecting.has(e)}handleChange(e,t){let i=he.getTokenById(t);i&&(this.hydrate(i,this.getRaw(i)),this.updateCSSTokenReflection(this.store,i))}hydrate(e,t){if(!this.has(e)){let i=this.bindingObservers.get(e);he.isDerivedDesignTokenValue(t)?i?i.source!==t&&(this.tearDownBindingObserver(e),this.setupBindingObserver(e,t)):this.setupBindingObserver(e,t):(i&&this.tearDownBindingObserver(e),this.store.set(e,t))}}setupBindingObserver(e,t){let i=new pi(t,e,this);return this.bindingObservers.set(e,i),i}tearDownBindingObserver(e){return this.bindingObservers.has(e)?(this.bindingObservers.get(e).disconnect(),this.bindingObservers.delete(e),!0):!1}};W.cssCustomPropertyReflector=new ui;l([f],W.prototype,"children",void 0);function ya(o){return he.from(o)}var Lt=Object.freeze({create:ya,notifyConnection(o){return!o.isConnected||!W.existsFor(o)?!1:(W.getOrCreate(o).bind(),!0)},notifyDisconnection(o){return o.isConnected||!W.existsFor(o)?!1:(W.getOrCreate(o).unbind(),!0)},registerRoot(o=we){qe.registerRoot(o)},unregisterRoot(o=we){qe.unregisterRoot(o)}});var mi=Object.freeze({definitionCallbackOnly:null,ignoreDuplicate:Symbol()}),bi=new Map,lo=new Map,vt=null,Ht=I.createInterface(o=>o.cachedCallback(e=>(vt===null&&(vt=new co(null,e)),vt))),vi=Object.freeze({tagFor(o){return lo.get(o)},responsibleFor(o){let e=o.$$designSystem$$;return e||I.findResponsibleContainer(o).get(Ht)},getOrCreate(o){if(!o)return vt===null&&(vt=I.getOrCreateDOMContainer().get(Ht)),vt;let e=o.$$designSystem$$;if(e)return e;let t=I.getOrCreateDOMContainer(o);if(t.has(Ht,!1))return t.get(Ht);{let i=new co(o,t);return t.register(Ke.instance(Ht,i)),i}}});function wa(o,e,t){return typeof o=="string"?{name:o,type:e,callback:t}:o}var co=class{constructor(e,t){this.owner=e,this.container=t,this.designTokensInitialized=!1,this.prefix="fast",this.shadowRootMode=void 0,this.disambiguate=()=>mi.definitionCallbackOnly,e!==null&&(e.$$designSystem$$=this)}withPrefix(e){return this.prefix=e,this}withShadowRootMode(e){return this.shadowRootMode=e,this}withElementDisambiguation(e){return this.disambiguate=e,this}withDesignTokenRoot(e){return this.designTokenRoot=e,this}register(...e){let t=this.container,i=[],r=this.disambiguate,n=this.shadowRootMode,s={elementPrefix:this.prefix,tryDefineElement(a,c,d){let u=wa(a,c,d),{name:p,callback:g,baseClass:R}=u,{type:A}=u,z=p,de=bi.get(z),$t=!0;for(;de;){let Pe=r(z,A,de);switch(Pe){case mi.ignoreDuplicate:return;case mi.definitionCallbackOnly:$t=!1,de=void 0;break;default:z=Pe,de=bi.get(z);break}}$t&&((lo.has(A)||A===k)&&(A=class extends A{}),bi.set(z,A),lo.set(A,z),R&&lo.set(R,z)),i.push(new gi(t,z,A,n,g,$t))}};this.designTokensInitialized||(this.designTokensInitialized=!0,this.designTokenRoot!==null&&Lt.registerRoot(this.designTokenRoot)),t.registerWithContext(s,...e);for(let a of i)a.callback(a),a.willDefine&&a.definition!==null&&a.definition.define();return this}},gi=class{constructor(e,t,i,r,n,s){this.container=e,this.name=t,this.type=i,this.shadowRootMode=r,this.callback=n,this.willDefine=s,this.definition=null}definePresentation(e){oo.define(this.name,e,this.container)}defineElement(e){this.definition=new be(this.type,Object.assign(Object.assign({},e),{name:this.name}))}tagFor(e){return vi.tagFor(e)}};var Jr=(o,e)=>x`
    <template role="${t=>t.role}" aria-orientation="${t=>t.orientation}"></template>
`;var xi={separator:"separator",presentation:"presentation"};var xt=class extends k{constructor(){super(...arguments),this.role=xi.separator,this.orientation=ft.horizontal}};l([h],xt.prototype,"role",void 0);l([h],xt.prototype,"orientation",void 0);var Kr=(o,e)=>x`
    <template
        aria-checked="${t=>t.ariaChecked}"
        aria-disabled="${t=>t.ariaDisabled}"
        aria-posinset="${t=>t.ariaPosInSet}"
        aria-selected="${t=>t.ariaSelected}"
        aria-setsize="${t=>t.ariaSetSize}"
        class="${t=>[t.checked&&"checked",t.selected&&"selected",t.disabled&&"disabled"].filter(Boolean).join(" ")}"
        role="option"
    >
        ${re(o,e)}
        <span class="content" part="content">
            <slot ${B("content")}></slot>
        </span>
        ${ie(o,e)}
    </template>
`;var rt=class extends j{constructor(){super(...arguments),this.activeIndex=-1,this.rangeStartIndex=-1}get activeOption(){return this.options[this.activeIndex]}get checkedOptions(){var e;return(e=this.options)===null||e===void 0?void 0:e.filter(t=>t.checked)}get firstSelectedOptionIndex(){return this.options.indexOf(this.firstSelectedOption)}activeIndexChanged(e,t){var i,r;this.ariaActiveDescendant=(r=(i=this.options[t])===null||i===void 0?void 0:i.id)!==null&&r!==void 0?r:"",this.focusAndScrollOptionIntoView()}checkActiveIndex(){if(!this.multiple)return;let e=this.activeOption;e&&(e.checked=!0)}checkFirstOption(e=!1){e?(this.rangeStartIndex===-1&&(this.rangeStartIndex=this.activeIndex+1),this.options.forEach((t,i)=>{t.checked=At(i,this.rangeStartIndex)})):this.uncheckAllOptions(),this.activeIndex=0,this.checkActiveIndex()}checkLastOption(e=!1){e?(this.rangeStartIndex===-1&&(this.rangeStartIndex=this.activeIndex),this.options.forEach((t,i)=>{t.checked=At(i,this.rangeStartIndex,this.options.length)})):this.uncheckAllOptions(),this.activeIndex=this.options.length-1,this.checkActiveIndex()}connectedCallback(){super.connectedCallback(),this.addEventListener("focusout",this.focusoutHandler)}disconnectedCallback(){this.removeEventListener("focusout",this.focusoutHandler),super.disconnectedCallback()}checkNextOption(e=!1){e?(this.rangeStartIndex===-1&&(this.rangeStartIndex=this.activeIndex),this.options.forEach((t,i)=>{t.checked=At(i,this.rangeStartIndex,this.activeIndex+1)})):this.uncheckAllOptions(),this.activeIndex+=this.activeIndex<this.options.length-1?1:0,this.checkActiveIndex()}checkPreviousOption(e=!1){e?(this.rangeStartIndex===-1&&(this.rangeStartIndex=this.activeIndex),this.checkedOptions.length===1&&(this.rangeStartIndex+=1),this.options.forEach((t,i)=>{t.checked=At(i,this.activeIndex,this.rangeStartIndex)})):this.uncheckAllOptions(),this.activeIndex-=this.activeIndex>0?1:0,this.checkActiveIndex()}clickHandler(e){var t;if(!this.multiple)return super.clickHandler(e);let i=(t=e.target)===null||t===void 0?void 0:t.closest("[role=option]");if(!(!i||i.disabled))return this.uncheckAllOptions(),this.activeIndex=this.options.indexOf(i),this.checkActiveIndex(),this.toggleSelectedForAllCheckedOptions(),!0}focusAndScrollOptionIntoView(){super.focusAndScrollOptionIntoView(this.activeOption)}focusinHandler(e){if(!this.multiple)return super.focusinHandler(e);!this.shouldSkipFocus&&e.target===e.currentTarget&&(this.uncheckAllOptions(),this.activeIndex===-1&&(this.activeIndex=this.firstSelectedOptionIndex!==-1?this.firstSelectedOptionIndex:0),this.checkActiveIndex(),this.setSelectedOptions(),this.focusAndScrollOptionIntoView()),this.shouldSkipFocus=!1}focusoutHandler(e){this.multiple&&this.uncheckAllOptions()}keydownHandler(e){if(!this.multiple)return super.keydownHandler(e);if(this.disabled)return!0;let{key:t,shiftKey:i}=e;switch(this.shouldSkipFocus=!1,t){case ne:{this.checkFirstOption(i);return}case K:{this.checkNextOption(i);return}case ee:{this.checkPreviousOption(i);return}case se:{this.checkLastOption(i);return}case mt:return this.focusAndScrollOptionIntoView(),!0;case ze:return this.uncheckAllOptions(),this.checkActiveIndex(),!0;case ve:if(e.preventDefault(),this.typeAheadExpired){this.toggleSelectedForAllCheckedOptions();return}default:return t.length===1&&this.handleTypeAhead(`${t}`),!0}}mousedownHandler(e){if(e.offsetX>=0&&e.offsetX<=this.scrollWidth)return super.mousedownHandler(e)}multipleChanged(e,t){var i;this.ariaMultiSelectable=t?"true":null,(i=this.options)===null||i===void 0||i.forEach(r=>{r.checked=t?!1:void 0}),this.setSelectedOptions()}setSelectedOptions(){if(!this.multiple){super.setSelectedOptions();return}this.$fastController.isConnected&&this.options&&(this.selectedOptions=this.options.filter(e=>e.selected),this.focusAndScrollOptionIntoView())}sizeChanged(e,t){var i;let r=Math.max(0,parseInt((i=t?.toFixed())!==null&&i!==void 0?i:"",10));r!==t&&v.queueUpdate(()=>{this.size=r})}toggleSelectedForAllCheckedOptions(){let e=this.checkedOptions.filter(i=>!i.disabled),t=!e.every(i=>i.selected);e.forEach(i=>i.selected=t),this.selectedIndex=this.options.indexOf(e[e.length-1]),this.setSelectedOptions()}typeaheadBufferChanged(e,t){if(!this.multiple){super.typeaheadBufferChanged(e,t);return}if(this.$fastController.isConnected){let i=this.getTypeaheadMatches(),r=this.options.indexOf(i[0]);r>-1&&(this.activeIndex=r,this.uncheckAllOptions(),this.checkActiveIndex()),this.typeAheadExpired=!1}}uncheckAllOptions(e=!1){this.options.forEach(t=>t.checked=this.multiple?!1:void 0),e||(this.rangeStartIndex=-1)}};l([f],rt.prototype,"activeIndex",void 0);l([h({mode:"boolean"})],rt.prototype,"multiple",void 0);l([h({converter:G})],rt.prototype,"size",void 0);var yi=class extends k{},ho=class extends Re(yi){constructor(){super(...arguments),this.proxy=document.createElement("input")}};var wi={email:"email",password:"password",tel:"tel",text:"text",url:"url"};var U=class extends ho{constructor(){super(...arguments),this.type=wi.text}readOnlyChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.readOnly=this.readOnly,this.validate())}autofocusChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.autofocus=this.autofocus,this.validate())}placeholderChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.placeholder=this.placeholder)}typeChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.type=this.type,this.validate())}listChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.setAttribute("list",this.list),this.validate())}maxlengthChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.maxLength=this.maxlength,this.validate())}minlengthChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.minLength=this.minlength,this.validate())}patternChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.pattern=this.pattern,this.validate())}sizeChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.size=this.size)}spellcheckChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.spellcheck=this.spellcheck)}connectedCallback(){super.connectedCallback(),this.proxy.setAttribute("type",this.type),this.validate(),this.autofocus&&v.queueUpdate(()=>{this.focus()})}select(){this.control.select(),this.$emit("select")}handleTextInput(){this.value=this.control.value}handleChange(){this.$emit("change")}validate(){super.validate(this.control)}};l([h({attribute:"readonly",mode:"boolean"})],U.prototype,"readOnly",void 0);l([h({mode:"boolean"})],U.prototype,"autofocus",void 0);l([h],U.prototype,"placeholder",void 0);l([h],U.prototype,"type",void 0);l([h],U.prototype,"list",void 0);l([h({converter:G})],U.prototype,"maxlength",void 0);l([h({converter:G})],U.prototype,"minlength",void 0);l([h],U.prototype,"pattern",void 0);l([h({converter:G})],U.prototype,"size",void 0);l([h({mode:"boolean"})],U.prototype,"spellcheck",void 0);l([f],U.prototype,"defaultSlottedNodes",void 0);var yt=class{};L(yt,S);L(U,X,yt);var en=44,tn=(o,e)=>x`
    <template
        role="progressbar"
        aria-valuenow="${t=>t.value}"
        aria-valuemin="${t=>t.min}"
        aria-valuemax="${t=>t.max}"
        class="${t=>t.paused?"paused":""}"
    >
        ${ht(t=>typeof t.value=="number",x`
                <svg
                    class="progress"
                    part="progress"
                    viewBox="0 0 16 16"
                    slot="determinate"
                >
                    <circle
                        class="background"
                        part="background"
                        cx="8px"
                        cy="8px"
                        r="7px"
                    ></circle>
                    <circle
                        class="determinate"
                        part="determinate"
                        style="stroke-dasharray: ${t=>en*t.percentComplete/100}px ${en}px"
                        cx="8px"
                        cy="8px"
                        r="7px"
                    ></circle>
                </svg>
            `,x`
                <slot name="indeterminate" slot="indeterminate">
                    ${e.indeterminateIndicator||""}
                </slot>
            `)}
    </template>
`;var Ae=class extends k{constructor(){super(...arguments),this.percentComplete=0}valueChanged(){this.$fastController.isConnected&&this.updatePercentComplete()}minChanged(){this.$fastController.isConnected&&this.updatePercentComplete()}maxChanged(){this.$fastController.isConnected&&this.updatePercentComplete()}connectedCallback(){super.connectedCallback(),this.updatePercentComplete()}updatePercentComplete(){let e=typeof this.min=="number"?this.min:0,t=typeof this.max=="number"?this.max:100,i=typeof this.value=="number"?this.value:0,r=t-e;this.percentComplete=r===0?0:Math.fround((i-e)/r*100)}};l([h({converter:G})],Ae.prototype,"value",void 0);l([h({converter:G})],Ae.prototype,"min",void 0);l([h({converter:G})],Ae.prototype,"max",void 0);l([h({mode:"boolean"})],Ae.prototype,"paused",void 0);l([f],Ae.prototype,"percentComplete",void 0);var on=(o,e)=>x`
    <template
        role="radiogroup"
        aria-disabled="${t=>t.disabled}"
        aria-readonly="${t=>t.readOnly}"
        @click="${(t,i)=>t.clickHandler(i.event)}"
        @keydown="${(t,i)=>t.keydownHandler(i.event)}"
        @focusout="${(t,i)=>t.focusOutHandler(i.event)}"
    >
        <slot name="label"></slot>
        <div
            class="positioning-region ${t=>t.orientation===ft.horizontal?"horizontal":"vertical"}"
            part="positioning-region"
        >
            <slot
                ${B({property:"slottedRadioButtons",filter:Je("[role=radio]")})}
            ></slot>
        </div>
    </template>
`;var ue=class extends k{constructor(){super(...arguments),this.orientation=ft.horizontal,this.radioChangeHandler=e=>{let t=e.target;t.checked&&(this.slottedRadioButtons.forEach(i=>{i!==t&&(i.checked=!1,this.isInsideFoundationToolbar||i.setAttribute("tabindex","-1"))}),this.selectedRadio=t,this.value=t.value,t.setAttribute("tabindex","0"),this.focusedRadio=t),e.stopPropagation()},this.moveToRadioByIndex=(e,t)=>{let i=e[t];this.isInsideToolbar||(i.setAttribute("tabindex","0"),i.readOnly?this.slottedRadioButtons.forEach(r=>{r!==i&&r.setAttribute("tabindex","-1")}):(i.checked=!0,this.selectedRadio=i)),this.focusedRadio=i,i.focus()},this.moveRightOffGroup=()=>{var e;(e=this.nextElementSibling)===null||e===void 0||e.focus()},this.moveLeftOffGroup=()=>{var e;(e=this.previousElementSibling)===null||e===void 0||e.focus()},this.focusOutHandler=e=>{let t=this.slottedRadioButtons,i=e.target,r=i!==null?t.indexOf(i):0,n=this.focusedRadio?t.indexOf(this.focusedRadio):-1;return(n===0&&r===n||n===t.length-1&&n===r)&&(this.selectedRadio?(this.focusedRadio=this.selectedRadio,this.isInsideFoundationToolbar||(this.selectedRadio.setAttribute("tabindex","0"),t.forEach(s=>{s!==this.selectedRadio&&s.setAttribute("tabindex","-1")}))):(this.focusedRadio=t[0],this.focusedRadio.setAttribute("tabindex","0"),t.forEach(s=>{s!==this.focusedRadio&&s.setAttribute("tabindex","-1")}))),!0},this.clickHandler=e=>{let t=e.target;if(t){let i=this.slottedRadioButtons;t.checked||i.indexOf(t)===0?(t.setAttribute("tabindex","0"),this.selectedRadio=t):(t.setAttribute("tabindex","-1"),this.selectedRadio=null),this.focusedRadio=t}e.preventDefault()},this.shouldMoveOffGroupToTheRight=(e,t,i)=>e===t.length&&this.isInsideToolbar&&i===Ne,this.shouldMoveOffGroupToTheLeft=(e,t)=>(this.focusedRadio?e.indexOf(this.focusedRadio)-1:0)<0&&this.isInsideToolbar&&t===Ve,this.checkFocusedRadio=()=>{this.focusedRadio!==null&&!this.focusedRadio.readOnly&&!this.focusedRadio.checked&&(this.focusedRadio.checked=!0,this.focusedRadio.setAttribute("tabindex","0"),this.focusedRadio.focus(),this.selectedRadio=this.focusedRadio)},this.moveRight=e=>{let t=this.slottedRadioButtons,i=0;if(i=this.focusedRadio?t.indexOf(this.focusedRadio)+1:1,this.shouldMoveOffGroupToTheRight(i,t,e.key)){this.moveRightOffGroup();return}else i===t.length&&(i=0);for(;i<t.length&&t.length>1;)if(t[i].disabled){if(this.focusedRadio&&i===t.indexOf(this.focusedRadio))break;if(i+1>=t.length){if(this.isInsideToolbar)break;i=0}else i+=1}else{this.moveToRadioByIndex(t,i);break}},this.moveLeft=e=>{let t=this.slottedRadioButtons,i=0;if(i=this.focusedRadio?t.indexOf(this.focusedRadio)-1:0,i=i<0?t.length-1:i,this.shouldMoveOffGroupToTheLeft(t,e.key)){this.moveLeftOffGroup();return}for(;i>=0&&t.length>1;)if(t[i].disabled){if(this.focusedRadio&&i===t.indexOf(this.focusedRadio))break;i-1<0?i=t.length-1:i-=1}else{this.moveToRadioByIndex(t,i);break}},this.keydownHandler=e=>{let t=e.key;if(t in Hr&&this.isInsideFoundationToolbar)return!0;switch(t){case ge:{this.checkFocusedRadio();break}case Ne:case K:{this.direction===je.ltr?this.moveRight(e):this.moveLeft(e);break}case Ve:case ee:{this.direction===je.ltr?this.moveLeft(e):this.moveRight(e);break}default:return!0}}}readOnlyChanged(){this.slottedRadioButtons!==void 0&&this.slottedRadioButtons.forEach(e=>{this.readOnly?e.readOnly=!0:e.readOnly=!1})}disabledChanged(){this.slottedRadioButtons!==void 0&&this.slottedRadioButtons.forEach(e=>{this.disabled?e.disabled=!0:e.disabled=!1})}nameChanged(){this.slottedRadioButtons&&this.slottedRadioButtons.forEach(e=>{e.setAttribute("name",this.name)})}valueChanged(){this.slottedRadioButtons&&this.slottedRadioButtons.forEach(e=>{e.value===this.value&&(e.checked=!0,this.selectedRadio=e)}),this.$emit("change")}slottedRadioButtonsChanged(e,t){this.slottedRadioButtons&&this.slottedRadioButtons.length>0&&this.setupRadioButtons()}get parentToolbar(){return this.closest('[role="toolbar"]')}get isInsideToolbar(){var e;return(e=this.parentToolbar)!==null&&e!==void 0?e:!1}get isInsideFoundationToolbar(){var e;return!!(!((e=this.parentToolbar)===null||e===void 0)&&e.$fastController)}connectedCallback(){super.connectedCallback(),this.direction=Nr(this),this.setupRadioButtons()}disconnectedCallback(){this.slottedRadioButtons.forEach(e=>{e.removeEventListener("change",this.radioChangeHandler)})}setupRadioButtons(){let e=this.slottedRadioButtons.filter(r=>r.hasAttribute("checked")),t=e?e.length:0;if(t>1){let r=e[t-1];r.checked=!0}let i=!1;if(this.slottedRadioButtons.forEach(r=>{this.name!==void 0&&r.setAttribute("name",this.name),this.disabled&&(r.disabled=!0),this.readOnly&&(r.readOnly=!0),this.value&&this.value===r.value?(this.selectedRadio=r,this.focusedRadio=r,r.checked=!0,r.setAttribute("tabindex","0"),i=!0):(this.isInsideFoundationToolbar||r.setAttribute("tabindex","-1"),r.checked=!1),r.addEventListener("change",this.radioChangeHandler)}),this.value===void 0&&this.slottedRadioButtons.length>0){let r=this.slottedRadioButtons.filter(s=>s.hasAttribute("checked")),n=r!==null?r.length:0;if(n>0&&!i){let s=r[n-1];s.checked=!0,this.focusedRadio=s,s.setAttribute("tabindex","0")}else this.slottedRadioButtons[0].setAttribute("tabindex","0"),this.focusedRadio=this.slottedRadioButtons[0]}}};l([h({attribute:"readonly",mode:"boolean"})],ue.prototype,"readOnly",void 0);l([h({attribute:"disabled",mode:"boolean"})],ue.prototype,"disabled",void 0);l([h],ue.prototype,"name",void 0);l([h],ue.prototype,"value",void 0);l([h],ue.prototype,"orientation",void 0);l([f],ue.prototype,"childItems",void 0);l([f],ue.prototype,"slottedRadioButtons",void 0);var rn=(o,e)=>x`
    <template
        role="radio"
        class="${t=>t.checked?"checked":""} ${t=>t.readOnly?"readonly":""}"
        aria-checked="${t=>t.checked}"
        aria-required="${t=>t.required}"
        aria-disabled="${t=>t.disabled}"
        aria-readonly="${t=>t.readOnly}"
        @keypress="${(t,i)=>t.keypressHandler(i.event)}"
        @click="${(t,i)=>t.clickHandler(i.event)}"
    >
        <div part="control" class="control">
            <slot name="checked-indicator">
                ${e.checkedIndicator||""}
            </slot>
        </div>
        <label
            part="label"
            class="${t=>t.defaultSlottedNodes&&t.defaultSlottedNodes.length?"label":"label label__hidden"}"
        >
            <slot ${B("defaultSlottedNodes")}></slot>
        </label>
    </template>
`;var Ci=class extends k{},uo=class extends ro(Ci){constructor(){super(...arguments),this.proxy=document.createElement("input")}};var nt=class extends uo{constructor(){super(),this.initialValue="on",this.keypressHandler=e=>{switch(e.key){case ve:!this.checked&&!this.readOnly&&(this.checked=!0);return}return!0},this.proxy.setAttribute("type","radio")}readOnlyChanged(){this.proxy instanceof HTMLInputElement&&(this.proxy.readOnly=this.readOnly)}defaultCheckedChanged(){var e;this.$fastController.isConnected&&!this.dirtyChecked&&(this.isInsideRadioGroup()||(this.checked=(e=this.defaultChecked)!==null&&e!==void 0?e:!1,this.dirtyChecked=!1))}connectedCallback(){var e,t;super.connectedCallback(),this.validate(),((e=this.parentElement)===null||e===void 0?void 0:e.getAttribute("role"))!=="radiogroup"&&this.getAttribute("tabindex")===null&&(this.disabled||this.setAttribute("tabindex","0")),this.checkedAttribute&&(this.dirtyChecked||this.isInsideRadioGroup()||(this.checked=(t=this.defaultChecked)!==null&&t!==void 0?t:!1,this.dirtyChecked=!1))}isInsideRadioGroup(){return this.closest("[role=radiogroup]")!==null}clickHandler(e){!this.disabled&&!this.readOnly&&!this.checked&&(this.checked=!0)}};l([h({attribute:"readonly",mode:"boolean"})],nt.prototype,"readOnly",void 0);l([f],nt.prototype,"name",void 0);l([f],nt.prototype,"defaultSlottedNodes",void 0);function nn(o,e,t){return o.nodeType!==Node.TEXT_NODE?!0:typeof o.nodeValue=="string"&&!!o.nodeValue.trim().length}var ki=class extends rt{},po=class extends Re(ki){constructor(){super(...arguments),this.proxy=document.createElement("select")}};var pe=class extends po{constructor(){super(...arguments),this.open=!1,this.forcedPosition=!1,this.listboxId=tt("listbox-"),this.maxHeight=0}openChanged(e,t){if(this.collapsible){if(this.open){this.ariaControls=this.listboxId,this.ariaExpanded="true",this.setPositioning(),this.focusAndScrollOptionIntoView(),this.indexWhenOpened=this.selectedIndex,v.queueUpdate(()=>this.focus());return}this.ariaControls="",this.ariaExpanded="false"}}get collapsible(){return!(this.multiple||typeof this.size=="number")}get value(){return y.track(this,"value"),this._value}set value(e){var t,i,r,n,s,a,c;let d=`${this._value}`;if(!((t=this._options)===null||t===void 0)&&t.length){let u=this._options.findIndex(R=>R.value===e),p=(r=(i=this._options[this.selectedIndex])===null||i===void 0?void 0:i.value)!==null&&r!==void 0?r:null,g=(s=(n=this._options[u])===null||n===void 0?void 0:n.value)!==null&&s!==void 0?s:null;(u===-1||p!==g)&&(e="",this.selectedIndex=u),e=(c=(a=this.firstSelectedOption)===null||a===void 0?void 0:a.value)!==null&&c!==void 0?c:e}d!==e&&(this._value=e,super.valueChanged(d,e),y.notify(this,"value"),this.updateDisplayValue())}updateValue(e){var t,i;this.$fastController.isConnected&&(this.value=(i=(t=this.firstSelectedOption)===null||t===void 0?void 0:t.value)!==null&&i!==void 0?i:""),e&&(this.$emit("input"),this.$emit("change",this,{bubbles:!0,composed:void 0}))}selectedIndexChanged(e,t){super.selectedIndexChanged(e,t),this.updateValue()}positionChanged(e,t){this.positionAttribute=t,this.setPositioning()}setPositioning(){let e=this.getBoundingClientRect(),i=window.innerHeight-e.bottom;this.position=this.forcedPosition?this.positionAttribute:e.top>i?Dt.above:Dt.below,this.positionAttribute=this.forcedPosition?this.positionAttribute:this.position,this.maxHeight=this.position===Dt.above?~~e.top:~~i}get displayValue(){var e,t;return y.track(this,"displayValue"),(t=(e=this.firstSelectedOption)===null||e===void 0?void 0:e.text)!==null&&t!==void 0?t:""}disabledChanged(e,t){super.disabledChanged&&super.disabledChanged(e,t),this.ariaDisabled=this.disabled?"true":"false"}formResetCallback(){this.setProxyOptions(),super.setDefaultSelectedOption(),this.selectedIndex===-1&&(this.selectedIndex=0)}clickHandler(e){if(!this.disabled){if(this.open){let t=e.target.closest("option,[role=option]");if(t&&t.disabled)return}return super.clickHandler(e),this.open=this.collapsible&&!this.open,!this.open&&this.indexWhenOpened!==this.selectedIndex&&this.updateValue(!0),!0}}focusoutHandler(e){var t;if(super.focusoutHandler(e),!this.open)return!0;let i=e.relatedTarget;if(this.isSameNode(i)){this.focus();return}!((t=this.options)===null||t===void 0)&&t.includes(i)||(this.open=!1,this.indexWhenOpened!==this.selectedIndex&&this.updateValue(!0))}handleChange(e,t){super.handleChange(e,t),t==="value"&&this.updateValue()}slottedOptionsChanged(e,t){this.options.forEach(i=>{y.getNotifier(i).unsubscribe(this,"value")}),super.slottedOptionsChanged(e,t),this.options.forEach(i=>{y.getNotifier(i).subscribe(this,"value")}),this.setProxyOptions(),this.updateValue()}mousedownHandler(e){var t;return e.offsetX>=0&&e.offsetX<=((t=this.listbox)===null||t===void 0?void 0:t.scrollWidth)?super.mousedownHandler(e):this.collapsible}multipleChanged(e,t){super.multipleChanged(e,t),this.proxy&&(this.proxy.multiple=t)}selectedOptionsChanged(e,t){var i;super.selectedOptionsChanged(e,t),(i=this.options)===null||i===void 0||i.forEach((r,n)=>{var s;let a=(s=this.proxy)===null||s===void 0?void 0:s.options.item(n);a&&(a.selected=r.selected)})}setDefaultSelectedOption(){var e;let t=(e=this.options)!==null&&e!==void 0?e:Array.from(this.children).filter(j.slottedOptionFilter),i=t?.findIndex(r=>r.hasAttribute("selected")||r.selected||r.value===this.value);if(i!==-1){this.selectedIndex=i;return}this.selectedIndex=0}setProxyOptions(){this.proxy instanceof HTMLSelectElement&&this.options&&(this.proxy.options.length=0,this.options.forEach(e=>{let t=e.proxy||(e instanceof HTMLOptionElement?e.cloneNode():null);t&&this.proxy.options.add(t)}))}keydownHandler(e){super.keydownHandler(e);let t=e.key||e.key.charCodeAt(0);switch(t){case ve:{e.preventDefault(),this.collapsible&&this.typeAheadExpired&&(this.open=!this.open);break}case ne:case se:{e.preventDefault();break}case ge:{e.preventDefault(),this.open=!this.open;break}case ze:{this.collapsible&&this.open&&(e.preventDefault(),this.open=!1);break}case mt:return this.collapsible&&this.open&&(e.preventDefault(),this.open=!1),!0}return!this.open&&this.indexWhenOpened!==this.selectedIndex&&(this.updateValue(!0),this.indexWhenOpened=this.selectedIndex),!(t===K||t===ee)}connectedCallback(){super.connectedCallback(),this.forcedPosition=!!this.positionAttribute,this.addEventListener("contentchange",this.updateDisplayValue)}disconnectedCallback(){this.removeEventListener("contentchange",this.updateDisplayValue),super.disconnectedCallback()}sizeChanged(e,t){super.sizeChanged(e,t),this.proxy&&(this.proxy.size=t)}updateDisplayValue(){this.collapsible&&y.notify(this,"displayValue")}};l([h({attribute:"open",mode:"boolean"})],pe.prototype,"open",void 0);l([Ji],pe.prototype,"collapsible",null);l([f],pe.prototype,"control",void 0);l([h({attribute:"position"})],pe.prototype,"positionAttribute",void 0);l([f],pe.prototype,"position",void 0);l([f],pe.prototype,"maxHeight",void 0);var Mt=class{};l([f],Mt.prototype,"ariaControls",void 0);L(Mt,ye);L(pe,X,Mt);var sn=(o,e)=>x`
    <template
        class="${t=>[t.collapsible&&"collapsible",t.collapsible&&t.open&&"open",t.disabled&&"disabled",t.collapsible&&t.position].filter(Boolean).join(" ")}"
        aria-activedescendant="${t=>t.ariaActiveDescendant}"
        aria-controls="${t=>t.ariaControls}"
        aria-disabled="${t=>t.ariaDisabled}"
        aria-expanded="${t=>t.ariaExpanded}"
        aria-haspopup="${t=>t.collapsible?"listbox":null}"
        aria-multiselectable="${t=>t.ariaMultiSelectable}"
        ?open="${t=>t.open}"
        role="combobox"
        tabindex="${t=>t.disabled?null:"0"}"
        @click="${(t,i)=>t.clickHandler(i.event)}"
        @focusin="${(t,i)=>t.focusinHandler(i.event)}"
        @focusout="${(t,i)=>t.focusoutHandler(i.event)}"
        @keydown="${(t,i)=>t.keydownHandler(i.event)}"
        @mousedown="${(t,i)=>t.mousedownHandler(i.event)}"
    >
        ${ht(t=>t.collapsible,x`
                <div
                    class="control"
                    part="control"
                    ?disabled="${t=>t.disabled}"
                    ${_("control")}
                >
                    ${re(o,e)}
                    <slot name="button-container">
                        <div class="selected-value" part="selected-value">
                            <slot name="selected-value">${t=>t.displayValue}</slot>
                        </div>
                        <div aria-hidden="true" class="indicator" part="indicator">
                            <slot name="indicator">
                                ${e.indicator||""}
                            </slot>
                        </div>
                    </slot>
                    ${ie(o,e)}
                </div>
            `)}
        <div
            class="listbox"
            id="${t=>t.listboxId}"
            part="listbox"
            role="listbox"
            ?disabled="${t=>t.disabled}"
            ?hidden="${t=>t.collapsible?!t.open:!1}"
            ${_("listbox")}
        >
            <slot
                ${B({filter:j.slottedOptionFilter,flatten:!0,property:"slottedOptions"})}
            ></slot>
        </div>
    </template>
`;var an=(o,e)=>x`
    <template slot="tabpanel" role="tabpanel">
        <slot></slot>
    </template>
`;var fo=class extends k{};var ln=(o,e)=>x`
    <template slot="tab" role="tab" aria-disabled="${t=>t.disabled}">
        <slot></slot>
    </template>
`;var Vt=class extends k{};l([h({mode:"boolean"})],Vt.prototype,"disabled",void 0);var cn=(o,e)=>x`
    <template class="${t=>t.orientation}">
        ${re(o,e)}
        <div class="tablist" part="tablist" role="tablist">
            <slot class="tab" name="tab" part="tab" ${B("tabs")}></slot>

            ${ht(t=>t.showActiveIndicator,x`
                    <div
                        ${_("activeIndicatorRef")}
                        class="activeIndicator"
                        part="activeIndicator"
                    ></div>
                `)}
        </div>
        ${ie(o,e)}
        <div class="tabpanel" part="tabpanel">
            <slot name="tabpanel" ${B("tabpanels")}></slot>
        </div>
    </template>
`;var mo={vertical:"vertical",horizontal:"horizontal"},ce=class extends k{constructor(){super(...arguments),this.orientation=mo.horizontal,this.activeindicator=!0,this.showActiveIndicator=!0,this.prevActiveTabIndex=0,this.activeTabIndex=0,this.ticking=!1,this.change=()=>{this.$emit("change",this.activetab)},this.isDisabledElement=e=>e.getAttribute("aria-disabled")==="true",this.isHiddenElement=e=>e.hasAttribute("hidden"),this.isFocusableElement=e=>!this.isDisabledElement(e)&&!this.isHiddenElement(e),this.setTabs=()=>{let e="gridColumn",t="gridRow",i=this.isHorizontal()?e:t;this.activeTabIndex=this.getActiveIndex(),this.showActiveIndicator=!1,this.tabs.forEach((r,n)=>{if(r.slot==="tab"){let s=this.activeTabIndex===n&&this.isFocusableElement(r);this.activeindicator&&this.isFocusableElement(r)&&(this.showActiveIndicator=!0);let a=this.tabIds[n],c=this.tabpanelIds[n];r.setAttribute("id",a),r.setAttribute("aria-selected",s?"true":"false"),r.setAttribute("aria-controls",c),r.addEventListener("click",this.handleTabClick),r.addEventListener("keydown",this.handleTabKeyDown),r.setAttribute("tabindex",s?"0":"-1"),s&&(this.activetab=r,this.activeid=a)}r.style[e]="",r.style[t]="",r.style[i]=`${n+1}`,this.isHorizontal()?r.classList.remove("vertical"):r.classList.add("vertical")})},this.setTabPanels=()=>{this.tabpanels.forEach((e,t)=>{let i=this.tabIds[t],r=this.tabpanelIds[t];e.setAttribute("id",r),e.setAttribute("aria-labelledby",i),this.activeTabIndex!==t?e.setAttribute("hidden",""):e.removeAttribute("hidden")})},this.handleTabClick=e=>{let t=e.currentTarget;t.nodeType===1&&this.isFocusableElement(t)&&(this.prevActiveTabIndex=this.activeTabIndex,this.activeTabIndex=this.tabs.indexOf(t),this.setComponent())},this.handleTabKeyDown=e=>{if(this.isHorizontal())switch(e.key){case Ve:e.preventDefault(),this.adjustBackward(e);break;case Ne:e.preventDefault(),this.adjustForward(e);break}else switch(e.key){case ee:e.preventDefault(),this.adjustBackward(e);break;case K:e.preventDefault(),this.adjustForward(e);break}switch(e.key){case ne:e.preventDefault(),this.adjust(-this.activeTabIndex);break;case se:e.preventDefault(),this.adjust(this.tabs.length-this.activeTabIndex-1);break}},this.adjustForward=e=>{let t=this.tabs,i=0;for(i=this.activetab?t.indexOf(this.activetab)+1:1,i===t.length&&(i=0);i<t.length&&t.length>1;)if(this.isFocusableElement(t[i])){this.moveToTabByIndex(t,i);break}else{if(this.activetab&&i===t.indexOf(this.activetab))break;i+1>=t.length?i=0:i+=1}},this.adjustBackward=e=>{let t=this.tabs,i=0;for(i=this.activetab?t.indexOf(this.activetab)-1:0,i=i<0?t.length-1:i;i>=0&&t.length>1;)if(this.isFocusableElement(t[i])){this.moveToTabByIndex(t,i);break}else i-1<0?i=t.length-1:i-=1},this.moveToTabByIndex=(e,t)=>{let i=e[t];this.activetab=i,this.prevActiveTabIndex=this.activeTabIndex,this.activeTabIndex=t,i.focus(),this.setComponent()}}orientationChanged(){this.$fastController.isConnected&&(this.setTabs(),this.setTabPanels(),this.handleActiveIndicatorPosition())}activeidChanged(e,t){this.$fastController.isConnected&&this.tabs.length<=this.tabpanels.length&&(this.prevActiveTabIndex=this.tabs.findIndex(i=>i.id===e),this.setTabs(),this.setTabPanels(),this.handleActiveIndicatorPosition())}tabsChanged(){this.$fastController.isConnected&&this.tabs.length<=this.tabpanels.length&&(this.tabIds=this.getTabIds(),this.tabpanelIds=this.getTabPanelIds(),this.setTabs(),this.setTabPanels(),this.handleActiveIndicatorPosition())}tabpanelsChanged(){this.$fastController.isConnected&&this.tabpanels.length<=this.tabs.length&&(this.tabIds=this.getTabIds(),this.tabpanelIds=this.getTabPanelIds(),this.setTabs(),this.setTabPanels(),this.handleActiveIndicatorPosition())}getActiveIndex(){return this.activeid!==void 0?this.tabIds.indexOf(this.activeid)===-1?0:this.tabIds.indexOf(this.activeid):0}getTabIds(){return this.tabs.map(e=>{var t;return(t=e.getAttribute("id"))!==null&&t!==void 0?t:`tab-${tt()}`})}getTabPanelIds(){return this.tabpanels.map(e=>{var t;return(t=e.getAttribute("id"))!==null&&t!==void 0?t:`panel-${tt()}`})}setComponent(){this.activeTabIndex!==this.prevActiveTabIndex&&(this.activeid=this.tabIds[this.activeTabIndex],this.focusTab(),this.change())}isHorizontal(){return this.orientation===mo.horizontal}handleActiveIndicatorPosition(){this.showActiveIndicator&&this.activeindicator&&this.activeTabIndex!==this.prevActiveTabIndex&&(this.ticking?this.ticking=!1:(this.ticking=!0,this.animateActiveIndicator()))}animateActiveIndicator(){this.ticking=!0;let e=this.isHorizontal()?"gridColumn":"gridRow",t=this.isHorizontal()?"translateX":"translateY",i=this.isHorizontal()?"offsetLeft":"offsetTop",r=this.activeIndicatorRef[i];this.activeIndicatorRef.style[e]=`${this.activeTabIndex+1}`;let n=this.activeIndicatorRef[i];this.activeIndicatorRef.style[e]=`${this.prevActiveTabIndex+1}`;let s=n-r;this.activeIndicatorRef.style.transform=`${t}(${s}px)`,this.activeIndicatorRef.classList.add("activeIndicatorTransition"),this.activeIndicatorRef.addEventListener("transitionend",()=>{this.ticking=!1,this.activeIndicatorRef.style[e]=`${this.activeTabIndex+1}`,this.activeIndicatorRef.style.transform=`${t}(0px)`,this.activeIndicatorRef.classList.remove("activeIndicatorTransition")})}adjust(e){let t=this.tabs.filter(s=>this.isFocusableElement(s)),i=t.indexOf(this.activetab),r=Mr(0,t.length-1,i+e),n=this.tabs.indexOf(t[r]);n>-1&&this.moveToTabByIndex(this.tabs,n)}focusTab(){this.tabs[this.activeTabIndex].focus()}connectedCallback(){super.connectedCallback(),this.tabIds=this.getTabIds(),this.tabpanelIds=this.getTabPanelIds(),this.activeTabIndex=this.getActiveIndex()}};l([h],ce.prototype,"orientation",void 0);l([h],ce.prototype,"activeid",void 0);l([f],ce.prototype,"tabs",void 0);l([f],ce.prototype,"tabpanels",void 0);l([h({mode:"boolean"})],ce.prototype,"activeindicator",void 0);l([f],ce.prototype,"activeIndicatorRef",void 0);l([f],ce.prototype,"showActiveIndicator",void 0);L(ce,X);var $i=class extends k{},bo=class extends Re($i){constructor(){super(...arguments),this.proxy=document.createElement("textarea")}};var Nt={none:"none",both:"both",horizontal:"horizontal",vertical:"vertical"};var N=class extends bo{constructor(){super(...arguments),this.resize=Nt.none,this.cols=20,this.handleTextInput=()=>{this.value=this.control.value}}readOnlyChanged(){this.proxy instanceof HTMLTextAreaElement&&(this.proxy.readOnly=this.readOnly)}autofocusChanged(){this.proxy instanceof HTMLTextAreaElement&&(this.proxy.autofocus=this.autofocus)}listChanged(){this.proxy instanceof HTMLTextAreaElement&&this.proxy.setAttribute("list",this.list)}maxlengthChanged(){this.proxy instanceof HTMLTextAreaElement&&(this.proxy.maxLength=this.maxlength)}minlengthChanged(){this.proxy instanceof HTMLTextAreaElement&&(this.proxy.minLength=this.minlength)}spellcheckChanged(){this.proxy instanceof HTMLTextAreaElement&&(this.proxy.spellcheck=this.spellcheck)}select(){this.control.select(),this.$emit("select")}handleChange(){this.$emit("change")}validate(){super.validate(this.control)}};l([h({mode:"boolean"})],N.prototype,"readOnly",void 0);l([h],N.prototype,"resize",void 0);l([h({mode:"boolean"})],N.prototype,"autofocus",void 0);l([h({attribute:"form"})],N.prototype,"formId",void 0);l([h],N.prototype,"list",void 0);l([h({converter:G})],N.prototype,"maxlength",void 0);l([h({converter:G})],N.prototype,"minlength",void 0);l([h],N.prototype,"name",void 0);l([h],N.prototype,"placeholder",void 0);l([h({converter:G,mode:"fromView"})],N.prototype,"cols",void 0);l([h({converter:G,mode:"fromView"})],N.prototype,"rows",void 0);l([h({mode:"boolean"})],N.prototype,"spellcheck",void 0);l([f],N.prototype,"defaultSlottedNodes",void 0);L(N,yt);var dn=(o,e)=>x`
    <template
        class="
            ${t=>t.readOnly?"readonly":""}
            ${t=>t.resize!==Nt.none?`resize-${t.resize}`:""}"
    >
        <label
            part="label"
            for="control"
            class="${t=>t.defaultSlottedNodes&&t.defaultSlottedNodes.length?"label":"label label__hidden"}"
        >
            <slot ${B("defaultSlottedNodes")}></slot>
        </label>
        <textarea
            part="control"
            class="control"
            id="control"
            ?autofocus="${t=>t.autofocus}"
            cols="${t=>t.cols}"
            ?disabled="${t=>t.disabled}"
            form="${t=>t.form}"
            list="${t=>t.list}"
            maxlength="${t=>t.maxlength}"
            minlength="${t=>t.minlength}"
            name="${t=>t.name}"
            placeholder="${t=>t.placeholder}"
            ?readonly="${t=>t.readOnly}"
            ?required="${t=>t.required}"
            rows="${t=>t.rows}"
            ?spellcheck="${t=>t.spellcheck}"
            :value="${t=>t.value}"
            aria-atomic="${t=>t.ariaAtomic}"
            aria-busy="${t=>t.ariaBusy}"
            aria-controls="${t=>t.ariaControls}"
            aria-current="${t=>t.ariaCurrent}"
            aria-describedby="${t=>t.ariaDescribedby}"
            aria-details="${t=>t.ariaDetails}"
            aria-disabled="${t=>t.ariaDisabled}"
            aria-errormessage="${t=>t.ariaErrormessage}"
            aria-flowto="${t=>t.ariaFlowto}"
            aria-haspopup="${t=>t.ariaHaspopup}"
            aria-hidden="${t=>t.ariaHidden}"
            aria-invalid="${t=>t.ariaInvalid}"
            aria-keyshortcuts="${t=>t.ariaKeyshortcuts}"
            aria-label="${t=>t.ariaLabel}"
            aria-labelledby="${t=>t.ariaLabelledby}"
            aria-live="${t=>t.ariaLive}"
            aria-owns="${t=>t.ariaOwns}"
            aria-relevant="${t=>t.ariaRelevant}"
            aria-roledescription="${t=>t.ariaRoledescription}"
            @input="${(t,i)=>t.handleTextInput()}"
            @change="${t=>t.handleChange()}"
            ${_("control")}
        ></textarea>
    </template>
`;var hn=(o,e)=>x`
    <template
        class="
            ${t=>t.readOnly?"readonly":""}
        "
    >
        <label
            part="label"
            for="control"
            class="${t=>t.defaultSlottedNodes&&t.defaultSlottedNodes.length?"label":"label label__hidden"}"
        >
            <slot
                ${B({property:"defaultSlottedNodes",filter:nn})}
            ></slot>
        </label>
        <div class="root" part="root">
            ${re(o,e)}
            <input
                class="control"
                part="control"
                id="control"
                @input="${t=>t.handleTextInput()}"
                @change="${t=>t.handleChange()}"
                ?autofocus="${t=>t.autofocus}"
                ?disabled="${t=>t.disabled}"
                list="${t=>t.list}"
                maxlength="${t=>t.maxlength}"
                minlength="${t=>t.minlength}"
                pattern="${t=>t.pattern}"
                placeholder="${t=>t.placeholder}"
                ?readonly="${t=>t.readOnly}"
                ?required="${t=>t.required}"
                size="${t=>t.size}"
                ?spellcheck="${t=>t.spellcheck}"
                :value="${t=>t.value}"
                type="${t=>t.type}"
                aria-atomic="${t=>t.ariaAtomic}"
                aria-busy="${t=>t.ariaBusy}"
                aria-controls="${t=>t.ariaControls}"
                aria-current="${t=>t.ariaCurrent}"
                aria-describedby="${t=>t.ariaDescribedby}"
                aria-details="${t=>t.ariaDetails}"
                aria-disabled="${t=>t.ariaDisabled}"
                aria-errormessage="${t=>t.ariaErrormessage}"
                aria-flowto="${t=>t.ariaFlowto}"
                aria-haspopup="${t=>t.ariaHaspopup}"
                aria-hidden="${t=>t.ariaHidden}"
                aria-invalid="${t=>t.ariaInvalid}"
                aria-keyshortcuts="${t=>t.ariaKeyshortcuts}"
                aria-label="${t=>t.ariaLabel}"
                aria-labelledby="${t=>t.ariaLabelledby}"
                aria-live="${t=>t.ariaLive}"
                aria-owns="${t=>t.ariaOwns}"
                aria-relevant="${t=>t.ariaRelevant}"
                aria-roledescription="${t=>t.ariaRoledescription}"
                ${_("control")}
            />
            ${ie(o,e)}
        </div>
    </template>
`;var Q="not-allowed";var Ca=":host([hidden]){display:none}";function $(o){return`${Ca}:host{display:${o}}`}var E=Pr()?"focus-visible":"focus";function un(o){return vi.getOrCreate(o).withPrefix("vscode")}function fn(o){window.addEventListener("load",()=>{new MutationObserver(()=>{pn(o)}).observe(document.body,{attributes:!0,attributeFilter:["class"]}),pn(o)})}function pn(o){let e=getComputedStyle(document.body),t=document.querySelector("body");if(t){let i=t.getAttribute("data-vscode-theme-kind");for(let[r,n]of o){let s=e.getPropertyValue(r).toString();if(i==="vscode-high-contrast")s.length===0&&n.name.includes("background")&&(s="transparent"),n.name==="button-icon-hover-background"&&(s="transparent");else if(i==="vscode-high-contrast-light"){if(s.length===0&&n.name.includes("background"))switch(n.name){case"button-primary-hover-background":s="#0F4A85";break;case"button-secondary-hover-background":s="transparent";break;case"button-icon-hover-background":s="transparent";break}}else n.name==="contrast-active-border"&&(s="transparent");n.setValueFor(t,s)}}}var mn=new Map,bn=!1;function m(o,e){let t=Lt.create(o);if(e){if(e.includes("--fake-vscode-token")){let i="id"+Math.random().toString(16).slice(2);e=`${e}-${i}`}mn.set(e,t)}return bn||(fn(mn),bn=!0),t}var gn=m("background","--vscode-editor-background").withDefault("#1e1e1e"),w=m("border-width").withDefault(1),go=m("contrast-active-border","--vscode-contrastActiveBorder").withDefault("#f38518"),um=m("contrast-border","--vscode-contrastBorder").withDefault("#6fc3df"),Ce=m("corner-radius").withDefault(0),ke=m("corner-radius-round").withDefault(2),b=m("design-unit").withDefault(4),J=m("disabled-opacity").withDefault(.4),T=m("focus-border","--vscode-focusBorder").withDefault("#007fd4"),F=m("font-family","--vscode-font-family").withDefault("-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol"),pm=m("font-weight","--vscode-font-weight").withDefault("400"),D=m("foreground","--vscode-foreground").withDefault("#cccccc"),wt=m("input-height").withDefault("26"),Ct=m("input-min-width").withDefault("100px"),O=m("type-ramp-base-font-size","--vscode-font-size").withDefault("13px"),P=m("type-ramp-base-line-height").withDefault("normal"),vo=m("type-ramp-minus1-font-size").withDefault("11px"),xo=m("type-ramp-minus1-line-height").withDefault("16px"),fm=m("type-ramp-minus2-font-size").withDefault("9px"),mm=m("type-ramp-minus2-line-height").withDefault("16px"),bm=m("type-ramp-plus1-font-size").withDefault("16px"),gm=m("type-ramp-plus1-line-height").withDefault("24px"),vn=m("scrollbarWidth").withDefault("10px"),xn=m("scrollbarHeight").withDefault("10px"),yn=m("scrollbar-slider-background","--vscode-scrollbarSlider-background").withDefault("#79797966"),wn=m("scrollbar-slider-hover-background","--vscode-scrollbarSlider-hoverBackground").withDefault("#646464b3"),Cn=m("scrollbar-slider-active-background","--vscode-scrollbarSlider-activeBackground").withDefault("#bfbfbf66"),yo=m("badge-background","--vscode-badge-background").withDefault("#4d4d4d"),wo=m("badge-foreground","--vscode-badge-foreground").withDefault("#ffffff"),kt=m("button-border","--vscode-button-border").withDefault("transparent"),Si=m("button-icon-background").withDefault("transparent"),kn=m("button-icon-corner-radius").withDefault("5px"),$n=m("button-icon-outline-offset").withDefault(0),Ti=m("button-icon-hover-background","--fake-vscode-token").withDefault("rgba(90, 93, 94, 0.31)"),Sn=m("button-icon-padding").withDefault("3px"),st=m("button-primary-background","--vscode-button-background").withDefault("#0e639c"),Ii=m("button-primary-foreground","--vscode-button-foreground").withDefault("#ffffff"),Oi=m("button-primary-hover-background","--vscode-button-hoverBackground").withDefault("#1177bb"),Co=m("button-secondary-background","--vscode-button-secondaryBackground").withDefault("#3a3d41"),Tn=m("button-secondary-foreground","--vscode-button-secondaryForeground").withDefault("#ffffff"),In=m("button-secondary-hover-background","--vscode-button-secondaryHoverBackground").withDefault("#45494e"),On=m("button-padding-horizontal").withDefault("11px"),Rn=m("button-padding-vertical").withDefault("4px"),fe=m("checkbox-background","--vscode-checkbox-background").withDefault("#3c3c3c"),We=m("checkbox-border","--vscode-checkbox-border").withDefault("#3c3c3c"),An=m("checkbox-corner-radius").withDefault(3),vm=m("checkbox-foreground","--vscode-checkbox-foreground").withDefault("#f0f0f0"),$e=m("list-active-selection-background","--vscode-list-activeSelectionBackground").withDefault("#094771"),Ee=m("list-active-selection-foreground","--vscode-list-activeSelectionForeground").withDefault("#ffffff"),En=m("list-hover-background","--vscode-list-hoverBackground").withDefault("#2a2d2e"),Dn=m("divider-background","--vscode-settings-dropdownListBorder").withDefault("#454545"),zt=m("dropdown-background","--vscode-dropdown-background").withDefault("#3c3c3c"),me=m("dropdown-border","--vscode-dropdown-border").withDefault("#3c3c3c"),xm=m("dropdown-foreground","--vscode-dropdown-foreground").withDefault("#f0f0f0"),Pn=m("dropdown-list-max-height").withDefault("200px"),De=m("input-background","--vscode-input-background").withDefault("#3c3c3c"),ko=m("input-foreground","--vscode-input-foreground").withDefault("#cccccc"),ym=m("input-placeholder-foreground","--vscode-input-placeholderForeground").withDefault("#cccccc"),Ri=m("link-active-foreground","--vscode-textLink-activeForeground").withDefault("#3794ff"),Fn=m("link-foreground","--vscode-textLink-foreground").withDefault("#3794ff"),Bn=m("progress-background","--vscode-progressBar-background").withDefault("#0e70c0"),_n=m("panel-tab-active-border","--vscode-panelTitle-activeBorder").withDefault("#e7e7e7"),Qe=m("panel-tab-active-foreground","--vscode-panelTitle-activeForeground").withDefault("#e7e7e7"),Ln=m("panel-tab-foreground","--vscode-panelTitle-inactiveForeground").withDefault("#e7e7e799"),wm=m("panel-view-background","--vscode-panel-background").withDefault("#1e1e1e"),Cm=m("panel-view-border","--vscode-panel-border").withDefault("#80808059"),Hn=m("tag-corner-radius").withDefault("2px");var Mn=(o,e)=>C`
	${$("inline-block")} :host {
		box-sizing: border-box;
		font-family: ${F};
		font-size: ${vo};
		line-height: ${xo};
		text-align: center;
	}
	.control {
		align-items: center;
		background-color: ${yo};
		border: calc(${w} * 1px) solid ${kt};
		border-radius: 11px;
		box-sizing: border-box;
		color: ${wo};
		display: flex;
		height: calc(${b} * 4px);
		justify-content: center;
		min-width: calc(${b} * 4px + 2px);
		min-height: calc(${b} * 4px + 2px);
		padding: 3px 6px;
	}
`;var Ai=class extends Oe{connectedCallback(){super.connectedCallback(),this.circular||(this.circular=!0)}},Vn=Ai.compose({baseName:"badge",template:io,styles:Mn});function Nn(o,e,t,i){var r=arguments.length,n=r<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,t):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(o,e,t,i);else for(var a=o.length-1;a>=0;a--)(s=o[a])&&(n=(r<3?s(n):r>3?s(e,t,n):s(e,t))||n);return r>3&&n&&Object.defineProperty(e,t,n),n}var ka=C`
	${$("inline-flex")} :host {
		outline: none;
		font-family: ${F};
		font-size: ${O};
		line-height: ${P};
		color: ${Ii};
		background: ${st};
		border-radius: calc(${ke} * 1px);
		fill: currentColor;
		cursor: pointer;
	}
	.control {
		background: transparent;
		height: inherit;
		flex-grow: 1;
		box-sizing: border-box;
		display: inline-flex;
		justify-content: center;
		align-items: center;
		padding: ${Rn} ${On};
		white-space: wrap;
		outline: none;
		text-decoration: none;
		border: calc(${w} * 1px) solid ${kt};
		color: inherit;
		border-radius: inherit;
		fill: inherit;
		cursor: inherit;
		font-family: inherit;
	}
	:host(:hover) {
		background: ${Oi};
	}
	:host(:active) {
		background: ${st};
	}
	.control:${E} {
		outline: calc(${w} * 1px) solid ${T};
		outline-offset: calc(${w} * 2px);
	}
	.control::-moz-focus-inner {
		border: 0;
	}
	:host([disabled]) {
		opacity: ${J};
		background: ${st};
		cursor: ${Q};
	}
	.content {
		display: flex;
	}
	.start {
		display: flex;
	}
	::slotted(svg),
	::slotted(span) {
		width: calc(${b} * 4px);
		height: calc(${b} * 4px);
	}
	.start {
		margin-inline-end: 8px;
	}
`,$a=C`
	:host([appearance='primary']) {
		background: ${st};
		color: ${Ii};
	}
	:host([appearance='primary']:hover) {
		background: ${Oi};
	}
	:host([appearance='primary']:active) .control:active {
		background: ${st};
	}
	:host([appearance='primary']) .control:${E} {
		outline: calc(${w} * 1px) solid ${T};
		outline-offset: calc(${w} * 2px);
	}
	:host([appearance='primary'][disabled]) {
		background: ${st};
	}
`,Sa=C`
	:host([appearance='secondary']) {
		background: ${Co};
		color: ${Tn};
	}
	:host([appearance='secondary']:hover) {
		background: ${In};
	}
	:host([appearance='secondary']:active) .control:active {
		background: ${Co};
	}
	:host([appearance='secondary']) .control:${E} {
		outline: calc(${w} * 1px) solid ${T};
		outline-offset: calc(${w} * 2px);
	}
	:host([appearance='secondary'][disabled]) {
		background: ${Co};
	}
`,Ta=C`
	:host([appearance='icon']) {
		background: ${Si};
		border-radius: ${kn};
		color: ${D};
	}
	:host([appearance='icon']:hover) {
		background: ${Ti};
		outline: 1px dotted ${go};
		outline-offset: -1px;
	}
	:host([appearance='icon']) .control {
		padding: ${Sn};
		border: none;
	}
	:host([appearance='icon']:active) .control:active {
		background: ${Ti};
	}
	:host([appearance='icon']) .control:${E} {
		outline: calc(${w} * 1px) solid ${T};
		outline-offset: ${$n};
	}
	:host([appearance='icon'][disabled]) {
		background: ${Si};
	}
`,zn=(o,e)=>C`
	${ka}
	${$a}
	${Sa}
	${Ta}
`;var $o=class extends Z{connectedCallback(){if(super.connectedCallback(),!this.appearance){let e=this.getAttribute("appearance");this.appearance=e}}attributeChangedCallback(e,t,i){e==="appearance"&&i==="icon"&&(this.getAttribute("aria-label")||(this.ariaLabel="Icon Button")),e==="aria-label"&&(this.ariaLabel=i),e==="disabled"&&(this.disabled=i!==null)}};Nn([h],$o.prototype,"appearance",void 0);var jn=$o.compose({baseName:"button",template:zr,styles:zn,shadowOptions:{delegatesFocus:!0}});var Un=(o,e)=>C`
	${$("inline-flex")} :host {
		align-items: center;
		outline: none;
		margin: calc(${b} * 1px) 0;
		user-select: none;
		font-size: ${O};
		line-height: ${P};
	}
	.control {
		position: relative;
		width: calc(${b} * 4px + 2px);
		height: calc(${b} * 4px + 2px);
		box-sizing: border-box;
		border-radius: calc(${An} * 1px);
		border: calc(${w} * 1px) solid ${We};
		background: ${fe};
		outline: none;
		cursor: pointer;
	}
	.label {
		font-family: ${F};
		color: ${D};
		padding-inline-start: calc(${b} * 2px + 2px);
		margin-inline-end: calc(${b} * 2px + 2px);
		cursor: pointer;
	}
	.label__hidden {
		display: none;
		visibility: hidden;
	}
	.checked-indicator {
		width: 100%;
		height: 100%;
		display: block;
		fill: ${D};
		opacity: 0;
		pointer-events: none;
	}
	.indeterminate-indicator {
		border-radius: 2px;
		background: ${D};
		position: absolute;
		top: 50%;
		left: 50%;
		width: 50%;
		height: 50%;
		transform: translate(-50%, -50%);
		opacity: 0;
	}
	:host(:enabled) .control:hover {
		background: ${fe};
		border-color: ${We};
	}
	:host(:enabled) .control:active {
		background: ${fe};
		border-color: ${T};
	}
	:host(:${E}) .control {
		border: calc(${w} * 1px) solid ${T};
	}
	:host(.disabled) .label,
	:host(.readonly) .label,
	:host(.readonly) .control,
	:host(.disabled) .control {
		cursor: ${Q};
	}
	:host(.checked:not(.indeterminate)) .checked-indicator,
	:host(.indeterminate) .indeterminate-indicator {
		opacity: 1;
	}
	:host(.disabled) {
		opacity: ${J};
	}
`;var Ei=class extends ot{connectedCallback(){super.connectedCallback(),this.textContent?this.setAttribute("aria-label",this.textContent):this.setAttribute("aria-label","Checkbox")}},Gn=Ei.compose({baseName:"checkbox",template:Yr,styles:Un,checkedIndicator:`
		<svg 
			part="checked-indicator"
			class="checked-indicator"
			width="16" 
			height="16" 
			viewBox="0 0 16 16" 
			xmlns="http://www.w3.org/2000/svg" 
			fill="currentColor"
		>
			<path 
				fill-rule="evenodd" 
				clip-rule="evenodd" 
				d="M14.431 3.323l-8.47 10-.79-.036-3.35-4.77.818-.574 2.978 4.24 8.051-9.506.764.646z"
			/>
		</svg>
	`,indeterminateIndicator:`
		<div part="indeterminate-indicator" class="indeterminate-indicator"></div>
	`});var qn=(o,e)=>C`
	:host {
		display: flex;
		position: relative;
		flex-direction: column;
		width: 100%;
	}
`;var Wn=(o,e)=>C`
	:host {
		display: grid;
		padding: calc((${b} / 4) * 1px) 0;
		box-sizing: border-box;
		width: 100%;
		background: transparent;
	}
	:host(.header) {
	}
	:host(.sticky-header) {
		background: ${gn};
		position: sticky;
		top: 0;
	}
	:host(:hover) {
		background: ${En};
		outline: 1px dotted ${go};
		outline-offset: -1px;
	}
`;var Qn=(o,e)=>C`
	:host {
		padding: calc(${b} * 1px) calc(${b} * 3px);
		color: ${D};
		opacity: 1;
		box-sizing: border-box;
		font-family: ${F};
		font-size: ${O};
		line-height: ${P};
		font-weight: 400;
		border: solid calc(${w} * 1px) transparent;
		border-radius: calc(${Ce} * 1px);
		white-space: wrap;
		overflow-wrap: anywhere;
	}
	:host(.column-header) {
		font-weight: 600;
	}
	:host(:${E}),
	:host(:focus),
	:host(:active) {
		background: ${$e};
		border: solid calc(${w} * 1px) ${T};
		color: ${Ee};
		outline: none;
	}
	:host(:${E}) ::slotted(*),
	:host(:focus) ::slotted(*),
	:host(:active) ::slotted(*) {
		color: ${Ee} !important;
	}
`;var Di=class extends V{connectedCallback(){super.connectedCallback(),this.getAttribute("aria-label")||this.setAttribute("aria-label","Data Grid")}},Xn=Di.compose({baseName:"data-grid",baseClass:V,template:Wr,styles:qn}),Pi=class extends M{},Yn=Pi.compose({baseName:"data-grid-row",baseClass:M,template:Qr,styles:Wn}),Fi=class extends ae{},Zn=Fi.compose({baseName:"data-grid-cell",baseClass:ae,template:Xr,styles:Qn});var Jn=(o,e)=>C`
	${$("block")} :host {
		border: none;
		border-top: calc(${w} * 1px) solid ${Dn};
		box-sizing: content-box;
		height: 0;
		margin: calc(${b} * 1px) 0;
		width: 100%;
	}
`;var Bi=class extends xt{},Kn=Bi.compose({baseName:"divider",template:Jr,styles:Jn});var es=(o,e)=>C`
	${$("inline-flex")} :host {
		background: ${zt};
		border-radius: calc(${ke} * 1px);
		box-sizing: border-box;
		color: ${D};
		contain: contents;
		font-family: ${F};
		height: calc(${wt} * 1px);
		position: relative;
		user-select: none;
		min-width: ${Ct};
		outline: none;
		vertical-align: top;
	}
	.control {
		align-items: center;
		box-sizing: border-box;
		border: calc(${w} * 1px) solid ${me};
		border-radius: calc(${ke} * 1px);
		cursor: pointer;
		display: flex;
		font-family: inherit;
		font-size: ${O};
		line-height: ${P};
		min-height: 100%;
		padding: 2px 6px 2px 8px;
		width: 100%;
	}
	.listbox {
		background: ${zt};
		border: calc(${w} * 1px) solid ${T};
		border-radius: calc(${ke} * 1px);
		box-sizing: border-box;
		display: inline-flex;
		flex-direction: column;
		left: 0;
		max-height: ${Pn};
		padding: 0;
		overflow-y: auto;
		position: absolute;
		width: 100%;
		z-index: 1;
	}
	.listbox[hidden] {
		display: none;
	}
	:host(:${E}) .control {
		border-color: ${T};
	}
	:host(:not([disabled]):hover) {
		background: ${zt};
		border-color: ${me};
	}
	:host(:${E}) ::slotted([aria-selected="true"][role="option"]:not([disabled])) {
		background: ${$e};
		border: calc(${w} * 1px) solid transparent;
		color: ${Ee};
	}
	:host([disabled]) {
		cursor: ${Q};
		opacity: ${J};
	}
	:host([disabled]) .control {
		cursor: ${Q};
		user-select: none;
	}
	:host([disabled]:hover) {
		background: ${zt};
		color: ${D};
		fill: currentcolor;
	}
	:host(:not([disabled])) .control:active {
		border-color: ${T};
	}
	:host(:empty) .listbox {
		display: none;
	}
	:host([open]) .control {
		border-color: ${T};
	}
	:host([open][position='above']) .listbox {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}
	:host([open][position='below']) .listbox {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}
	:host([open][position='above']) .listbox {
		bottom: calc(${wt} * 1px);
	}
	:host([open][position='below']) .listbox {
		top: calc(${wt} * 1px);
	}
	.selected-value {
		flex: 1 1 auto;
		font-family: inherit;
		overflow: hidden;
		text-align: start;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.indicator {
		flex: 0 0 auto;
		margin-inline-start: 1em;
	}
	slot[name='listbox'] {
		display: none;
		width: 100%;
	}
	:host([open]) slot[name='listbox'] {
		display: flex;
		position: absolute;
	}
	.end {
		margin-inline-start: auto;
	}
	.start,
	.end,
	.indicator,
	.select-indicator,
	::slotted(svg),
	::slotted(span) {
		fill: currentcolor;
		height: 1em;
		min-height: calc(${b} * 4px);
		min-width: calc(${b} * 4px);
		width: 1em;
	}
	::slotted([role='option']),
	::slotted(option) {
		flex: 0 0 auto;
	}
`;var _i=class extends pe{},ts=_i.compose({baseName:"dropdown",template:sn,styles:es,indicator:`
		<svg 
			class="select-indicator"
			part="select-indicator"
			width="16" 
			height="16" 
			viewBox="0 0 16 16" 
			xmlns="http://www.w3.org/2000/svg" 
			fill="currentColor"
		>
			<path 
				fill-rule="evenodd" 
				clip-rule="evenodd" 
				d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"
			/>
		</svg>
	`});var os=(o,e)=>C`
	${$("inline-flex")} :host {
		background: transparent;
		box-sizing: border-box;
		color: ${Fn};
		cursor: pointer;
		fill: currentcolor;
		font-family: ${F};
		font-size: ${O};
		line-height: ${P};
		outline: none;
	}
	.control {
		background: transparent;
		border: calc(${w} * 1px) solid transparent;
		border-radius: calc(${Ce} * 1px);
		box-sizing: border-box;
		color: inherit;
		cursor: inherit;
		fill: inherit;
		font-family: inherit;
		height: inherit;
		padding: 0;
		outline: none;
		text-decoration: none;
		word-break: break-word;
	}
	.control::-moz-focus-inner {
		border: 0;
	}
	:host(:hover) {
		color: ${Ri};
	}
	:host(:hover) .content {
		text-decoration: underline;
	}
	:host(:active) {
		background: transparent;
		color: ${Ri};
	}
	:host(:${E}) .control,
	:host(:focus) .control {
		border: calc(${w} * 1px) solid ${T};
	}
`;var Li=class extends Y{},is=Li.compose({baseName:"link",template:Vr,styles:os,shadowOptions:{delegatesFocus:!0}});var rs=(o,e)=>C`
	${$("inline-flex")} :host {
		font-family: var(--body-font);
		border-radius: ${Ce};
		border: calc(${w} * 1px) solid transparent;
		box-sizing: border-box;
		color: ${D};
		cursor: pointer;
		fill: currentcolor;
		font-size: ${O};
		line-height: ${P};
		margin: 0;
		outline: none;
		overflow: hidden;
		padding: 0 calc((${b} / 2) * 1px)
			calc((${b} / 4) * 1px);
		user-select: none;
		white-space: nowrap;
	}
	:host(:${E}) {
		border-color: ${T};
		background: ${$e};
		color: ${D};
	}
	:host([aria-selected='true']) {
		background: ${$e};
		border: calc(${w} * 1px) solid transparent;
		color: ${Ee};
	}
	:host(:active) {
		background: ${$e};
		color: ${Ee};
	}
	:host(:not([aria-selected='true']):hover) {
		background: ${$e};
		border: calc(${w} * 1px) solid transparent;
		color: ${Ee};
	}
	:host(:not([aria-selected='true']):active) {
		background: ${$e};
		color: ${D};
	}
	:host([disabled]) {
		cursor: ${Q};
		opacity: ${J};
	}
	:host([disabled]:hover) {
		background-color: inherit;
	}
	.content {
		grid-column-start: 2;
		justify-self: start;
		overflow: hidden;
		text-overflow: ellipsis;
	}
`;var Hi=class extends le{connectedCallback(){super.connectedCallback(),this.textContent?this.setAttribute("aria-label",this.textContent):this.setAttribute("aria-label","Option")}},ns=Hi.compose({baseName:"option",template:Kr,styles:rs});var ss=(o,e)=>C`
	${$("grid")} :host {
		box-sizing: border-box;
		font-family: ${F};
		font-size: ${O};
		line-height: ${P};
		color: ${D};
		grid-template-columns: auto 1fr auto;
		grid-template-rows: auto 1fr;
		overflow-x: auto;
	}
	.tablist {
		display: grid;
		grid-template-rows: auto auto;
		grid-template-columns: auto;
		column-gap: calc(${b} * 8px);
		position: relative;
		width: max-content;
		align-self: end;
		padding: calc(${b} * 1px) calc(${b} * 1px) 0;
		box-sizing: border-box;
	}
	.start,
	.end {
		align-self: center;
	}
	.activeIndicator {
		grid-row: 2;
		grid-column: 1;
		width: 100%;
		height: calc((${b} / 4) * 1px);
		justify-self: center;
		background: ${Qe};
		margin: 0;
		border-radius: calc(${Ce} * 1px);
	}
	.activeIndicatorTransition {
		transition: transform 0.01s linear;
	}
	.tabpanel {
		grid-row: 2;
		grid-column-start: 1;
		grid-column-end: 4;
		position: relative;
	}
`;var as=(o,e)=>C`
	${$("inline-flex")} :host {
		box-sizing: border-box;
		font-family: ${F};
		font-size: ${O};
		line-height: ${P};
		height: calc(${b} * 7px);
		padding: calc(${b} * 1px) 0;
		color: ${Ln};
		fill: currentcolor;
		border-radius: calc(${Ce} * 1px);
		border: solid calc(${w} * 1px) transparent;
		align-items: center;
		justify-content: center;
		grid-row: 1;
		cursor: pointer;
	}
	:host(:hover) {
		color: ${Qe};
		fill: currentcolor;
	}
	:host(:active) {
		color: ${Qe};
		fill: currentcolor;
	}
	:host([aria-selected='true']) {
		background: transparent;
		color: ${Qe};
		fill: currentcolor;
	}
	:host([aria-selected='true']:hover) {
		background: transparent;
		color: ${Qe};
		fill: currentcolor;
	}
	:host([aria-selected='true']:active) {
		background: transparent;
		color: ${Qe};
		fill: currentcolor;
	}
	:host(:${E}) {
		outline: none;
		border: solid calc(${w} * 1px) ${_n};
	}
	:host(:focus) {
		outline: none;
	}
	::slotted(vscode-badge) {
		margin-inline-start: calc(${b} * 2px);
	}
`;var ls=(o,e)=>C`
	${$("flex")} :host {
		color: inherit;
		background-color: transparent;
		border: solid calc(${w} * 1px) transparent;
		box-sizing: border-box;
		font-size: ${O};
		line-height: ${P};
		padding: 10px calc((${b} + 2) * 1px);
	}
`;var Mi=class extends ce{connectedCallback(){super.connectedCallback(),this.orientation&&(this.orientation=mo.horizontal),this.getAttribute("aria-label")||this.setAttribute("aria-label","Panels")}},cs=Mi.compose({baseName:"panels",template:cn,styles:ss}),Vi=class extends Vt{connectedCallback(){super.connectedCallback(),this.disabled&&(this.disabled=!1),this.textContent&&this.setAttribute("aria-label",this.textContent)}},ds=Vi.compose({baseName:"panel-tab",template:ln,styles:as}),Ni=class extends fo{},hs=Ni.compose({baseName:"panel-view",template:an,styles:ls});var us=(o,e)=>C`
	${$("flex")} :host {
		align-items: center;
		outline: none;
		height: calc(${b} * 7px);
		width: calc(${b} * 7px);
		margin: 0;
	}
	.progress {
		height: 100%;
		width: 100%;
	}
	.background {
		fill: none;
		stroke: transparent;
		stroke-width: calc(${b} / 2 * 1px);
	}
	.indeterminate-indicator-1 {
		fill: none;
		stroke: ${Bn};
		stroke-width: calc(${b} / 2 * 1px);
		stroke-linecap: square;
		transform-origin: 50% 50%;
		transform: rotate(-90deg);
		transition: all 0.2s ease-in-out;
		animation: spin-infinite 2s linear infinite;
	}
	@keyframes spin-infinite {
		0% {
			stroke-dasharray: 0.01px 43.97px;
			transform: rotate(0deg);
		}
		50% {
			stroke-dasharray: 21.99px 21.99px;
			transform: rotate(450deg);
		}
		100% {
			stroke-dasharray: 0.01px 43.97px;
			transform: rotate(1080deg);
		}
	}
`;var zi=class extends Ae{connectedCallback(){super.connectedCallback(),this.paused&&(this.paused=!1),this.setAttribute("aria-label","Loading"),this.setAttribute("aria-live","assertive"),this.setAttribute("role","alert")}attributeChangedCallback(e,t,i){e==="value"&&this.removeAttribute("value")}},ps=zi.compose({baseName:"progress-ring",template:tn,styles:us,indeterminateIndicator:`
		<svg class="progress" part="progress" viewBox="0 0 16 16">
			<circle
				class="background"
				part="background"
				cx="8px"
				cy="8px"
				r="7px"
			></circle>
			<circle
				class="indeterminate-indicator-1"
				part="indeterminate-indicator-1"
				cx="8px"
				cy="8px"
				r="7px"
			></circle>
		</svg>
	`});var fs=(o,e)=>C`
	${$("flex")} :host {
		align-items: flex-start;
		margin: calc(${b} * 1px) 0;
		flex-direction: column;
	}
	.positioning-region {
		display: flex;
		flex-wrap: wrap;
	}
	:host([orientation='vertical']) .positioning-region {
		flex-direction: column;
	}
	:host([orientation='horizontal']) .positioning-region {
		flex-direction: row;
	}
	::slotted([slot='label']) {
		color: ${D};
		font-size: ${O};
		margin: calc(${b} * 1px) 0;
	}
`;var ji=class extends ue{connectedCallback(){super.connectedCallback();let e=this.querySelector("label");if(e){let t="radio-group-"+Math.random().toString(16).slice(2);e.setAttribute("id",t),this.setAttribute("aria-labelledby",t)}}},ms=ji.compose({baseName:"radio-group",template:on,styles:fs});var bs=(o,e)=>C`
	${$("inline-flex")} :host {
		align-items: center;
		flex-direction: row;
		font-size: ${O};
		line-height: ${P};
		margin: calc(${b} * 1px) 0;
		outline: none;
		position: relative;
		transition: all 0.2s ease-in-out;
		user-select: none;
	}
	.control {
		background: ${fe};
		border-radius: 999px;
		border: calc(${w} * 1px) solid ${We};
		box-sizing: border-box;
		cursor: pointer;
		height: calc(${b} * 4px);
		position: relative;
		outline: none;
		width: calc(${b} * 4px);
	}
	.label {
		color: ${D};
		cursor: pointer;
		font-family: ${F};
		margin-inline-end: calc(${b} * 2px + 2px);
		padding-inline-start: calc(${b} * 2px + 2px);
	}
	.label__hidden {
		display: none;
		visibility: hidden;
	}
	.control,
	.checked-indicator {
		flex-shrink: 0;
	}
	.checked-indicator {
		background: ${D};
		border-radius: 999px;
		display: inline-block;
		inset: calc(${b} * 1px);
		opacity: 0;
		pointer-events: none;
		position: absolute;
	}
	:host(:not([disabled])) .control:hover {
		background: ${fe};
		border-color: ${We};
	}
	:host(:not([disabled])) .control:active {
		background: ${fe};
		border-color: ${T};
	}
	:host(:${E}) .control {
		border: calc(${w} * 1px) solid ${T};
	}
	:host([aria-checked='true']) .control {
		background: ${fe};
		border: calc(${w} * 1px) solid ${We};
	}
	:host([aria-checked='true']:not([disabled])) .control:hover {
		background: ${fe};
		border: calc(${w} * 1px) solid ${We};
	}
	:host([aria-checked='true']:not([disabled])) .control:active {
		background: ${fe};
		border: calc(${w} * 1px) solid ${T};
	}
	:host([aria-checked="true"]:${E}:not([disabled])) .control {
		border: calc(${w} * 1px) solid ${T};
	}
	:host([disabled]) .label,
	:host([readonly]) .label,
	:host([readonly]) .control,
	:host([disabled]) .control {
		cursor: ${Q};
	}
	:host([aria-checked='true']) .checked-indicator {
		opacity: 1;
	}
	:host([disabled]) {
		opacity: ${J};
	}
`;var Ui=class extends nt{connectedCallback(){super.connectedCallback(),this.textContent?this.setAttribute("aria-label",this.textContent):this.setAttribute("aria-label","Radio")}},gs=Ui.compose({baseName:"radio",template:rn,styles:bs,checkedIndicator:`
		<div part="checked-indicator" class="checked-indicator"></div>
	`});var vs=(o,e)=>C`
	${$("inline-block")} :host {
		box-sizing: border-box;
		font-family: ${F};
		font-size: ${vo};
		line-height: ${xo};
	}
	.control {
		background-color: ${yo};
		border: calc(${w} * 1px) solid ${kt};
		border-radius: ${Hn};
		color: ${wo};
		padding: calc(${b} * 0.5px) calc(${b} * 1px);
		text-transform: uppercase;
	}
`;var Gi=class extends Oe{connectedCallback(){super.connectedCallback(),this.circular&&(this.circular=!1)}},xs=Gi.compose({baseName:"tag",template:io,styles:vs});var ys=(o,e)=>C`
	${$("inline-block")} :host {
		font-family: ${F};
		outline: none;
		user-select: none;
	}
	.control {
		box-sizing: border-box;
		position: relative;
		color: ${ko};
		background: ${De};
		border-radius: calc(${ke} * 1px);
		border: calc(${w} * 1px) solid ${me};
		font: inherit;
		font-size: ${O};
		line-height: ${P};
		padding: calc(${b} * 2px + 1px);
		width: 100%;
		min-width: ${Ct};
		resize: none;
	}
	.control:hover:enabled {
		background: ${De};
		border-color: ${me};
	}
	.control:active:enabled {
		background: ${De};
		border-color: ${T};
	}
	.control:hover,
	.control:${E},
	.control:disabled,
	.control:active {
		outline: none;
	}
	.control::-webkit-scrollbar {
		width: ${vn};
		height: ${xn};
	}
	.control::-webkit-scrollbar-corner {
		background: ${De};
	}
	.control::-webkit-scrollbar-thumb {
		background: ${yn};
	}
	.control::-webkit-scrollbar-thumb:hover {
		background: ${wn};
	}
	.control::-webkit-scrollbar-thumb:active {
		background: ${Cn};
	}
	:host(:focus-within:not([disabled])) .control {
		border-color: ${T};
	}
	:host([resize='both']) .control {
		resize: both;
	}
	:host([resize='horizontal']) .control {
		resize: horizontal;
	}
	:host([resize='vertical']) .control {
		resize: vertical;
	}
	.label {
		display: block;
		color: ${D};
		cursor: pointer;
		font-size: ${O};
		line-height: ${P};
		margin-bottom: 2px;
	}
	.label__hidden {
		display: none;
		visibility: hidden;
	}
	:host([disabled]) .label,
	:host([readonly]) .label,
	:host([readonly]) .control,
	:host([disabled]) .control {
		cursor: ${Q};
	}
	:host([disabled]) {
		opacity: ${J};
	}
	:host([disabled]) .control {
		border-color: ${me};
	}
`;var qi=class extends N{connectedCallback(){super.connectedCallback(),this.textContent?this.setAttribute("aria-label",this.textContent):this.setAttribute("aria-label","Text area")}},ws=qi.compose({baseName:"text-area",template:dn,styles:ys,shadowOptions:{delegatesFocus:!0}});var Cs=(o,e)=>C`
	${$("inline-block")} :host {
		font-family: ${F};
		outline: none;
		user-select: none;
	}
	.root {
		box-sizing: border-box;
		position: relative;
		display: flex;
		flex-direction: row;
		color: ${ko};
		background: ${De};
		border-radius: calc(${ke} * 1px);
		border: calc(${w} * 1px) solid ${me};
		height: calc(${wt} * 1px);
		min-width: ${Ct};
	}
	.control {
		-webkit-appearance: none;
		font: inherit;
		background: transparent;
		border: 0;
		color: inherit;
		height: calc(100% - (${b} * 1px));
		width: 100%;
		margin-top: auto;
		margin-bottom: auto;
		border: none;
		padding: 0 calc(${b} * 2px + 1px);
		font-size: ${O};
		line-height: ${P};
	}
	.control:hover,
	.control:${E},
	.control:disabled,
	.control:active {
		outline: none;
	}
	.label {
		display: block;
		color: ${D};
		cursor: pointer;
		font-size: ${O};
		line-height: ${P};
		margin-bottom: 2px;
	}
	.label__hidden {
		display: none;
		visibility: hidden;
	}
	.start,
	.end {
		display: flex;
		margin: auto;
		fill: currentcolor;
	}
	::slotted(svg),
	::slotted(span) {
		width: calc(${b} * 4px);
		height: calc(${b} * 4px);
	}
	.start {
		margin-inline-start: calc(${b} * 2px);
	}
	.end {
		margin-inline-end: calc(${b} * 2px);
	}
	:host(:hover:not([disabled])) .root {
		background: ${De};
		border-color: ${me};
	}
	:host(:active:not([disabled])) .root {
		background: ${De};
		border-color: ${T};
	}
	:host(:focus-within:not([disabled])) .root {
		border-color: ${T};
	}
	:host([disabled]) .label,
	:host([readonly]) .label,
	:host([readonly]) .control,
	:host([disabled]) .control {
		cursor: ${Q};
	}
	:host([disabled]) {
		opacity: ${J};
	}
	:host([disabled]) .control {
		border-color: ${me};
	}
`;var Wi=class extends U{connectedCallback(){super.connectedCallback(),this.textContent?this.setAttribute("aria-label",this.textContent):this.setAttribute("aria-label","Text field")}},ks=Wi.compose({baseName:"text-field",template:hn,styles:Cs,shadowOptions:{delegatesFocus:!0}});var $s={vsCodeBadge:Vn,vsCodeButton:jn,vsCodeCheckbox:Gn,vsCodeDataGrid:Xn,vsCodeDataGridCell:Zn,vsCodeDataGridRow:Yn,vsCodeDivider:Kn,vsCodeDropdown:ts,vsCodeLink:is,vsCodeOption:ns,vsCodePanels:cs,vsCodePanelTab:ds,vsCodePanelView:hs,vsCodeProgressRing:ps,vsCodeRadioGroup:ms,vsCodeRadio:gs,vsCodeTag:xs,vsCodeTextArea:ws,vsCodeTextField:ks,register(o,...e){if(o)for(let t in this)t!=="register"&&this[t]().register(o,...e)}};un().register($s);})();
/*! Bundled license information:

tslib/tslib.es6.js:
  (*! *****************************************************************************
  Copyright (c) Microsoft Corporation.
  
  Permission to use, copy, modify, and/or distribute this software for any
  purpose with or without fee is hereby granted.
  
  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
  REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
  AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
  INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
  LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
  OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
  PERFORMANCE OF THIS SOFTWARE.
  ***************************************************************************** *)
*/
//# sourceMappingURL=toolkit.js.map
