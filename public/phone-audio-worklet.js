class TariqPhoneAudio extends AudioWorkletProcessor{
 constructor(){super();this.active=false;this.queue=new Float32Array(48000);this.read=0;this.write=0;this.count=0;this.phase=0;this.started=false;this.capture=[];this.capturePhase=0;
 this.port.onmessage=event=>{const m=event.data;if(m.type==='active'){this.active=m.value;this.read=this.write=this.count=0;this.phase=0;this.capture=[];this.started=false}
 if(m.type==='remote'&&m.buffer){const view=new DataView(m.buffer);for(let i=0;i+1<view.byteLength;i+=2){if(this.count>=this.queue.length){this.read=(this.read+1)%this.queue.length;this.count--}this.queue[this.write]=view.getInt16(i,true)/32768;this.write=(this.write+1)%this.queue.length;this.count++}if(this.count>6400){const drop=this.count-1920;this.read=(this.read+drop)%this.queue.length;this.count-=drop}}};
 }
 process(inputs,outputs){const output=outputs[0]?.[0];if(!output)return true;output.fill(0);if(!this.active)return true;
 const input=inputs[0]?.[0];const step=16000/sampleRate;
 if(input){for(let i=0;i<input.length;i++){this.capturePhase+=step;if(this.capturePhase>=1){this.capturePhase-=1;this.capture.push(Math.max(-1,Math.min(1,input[i])))}if(this.capture.length===320){const buffer=new ArrayBuffer(640),view=new DataView(buffer);for(let j=0;j<320;j++)view.setInt16(j*2,Math.round(this.capture[j]*32767),true);this.capture=[];this.port.postMessage({type:'capture',buffer},[buffer])}}}
 if(!this.started&&this.count>=640)this.started=true;
 if(this.started){for(let i=0;i<output.length;i++){if(this.count<2){this.started=false;break}const a=this.queue[this.read],b=this.queue[(this.read+1)%this.queue.length];output[i]=a+(b-a)*this.phase;this.phase+=step;while(this.phase>=1){this.phase--;this.read=(this.read+1)%this.queue.length;this.count--}}}
 return true;
 }
}
registerProcessor('tariq-phone-audio',TariqPhoneAudio);
