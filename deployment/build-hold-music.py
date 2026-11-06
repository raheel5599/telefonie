"""Three original, procedurally composed telephone music loops; no sampled recordings."""
import math,pathlib,struct,wave
OUT=pathlib.Path(__file__).resolve().parent.parent/'public/audio';OUT.mkdir(exist_ok=True)
RATE=8000;SECONDS=24;N=RATE*SECONDS
for track in range(3):
    samples=[0.0]*N
    chords=[[48,52,55,59],[45,48,52,55],[41,45,48,52],[43,47,50,55]]
    if track==1:chords=[[50,54,57,61],[47,50,54,57],[43,47,50,54],[45,49,52,57]]
    if track==2:chords=[[48,55,59,62],[45,52,55,59],[41,48,52,55],[43,50,55,59]]
    def note(midi,start,duration,gain,style):
        f=440*2**((midi-69)/12);first=int(start*RATE);last=min(N,first+int(duration*RATE))
        for i in range(first,last):
            t=(i-first)/RATE;fade=min(1,t/.018)*min(1,max(0,(duration-t)/.15));decay=math.exp(-t*(2.4 if style==0 else 3.3 if style==1 else 1.1))
            value=math.sin(2*math.pi*f*t)+.22*math.sin(2*math.pi*f*2*t)+.07*math.sin(2*math.pi*f*3*t)
            samples[i]+=gain*fade*decay*value
    for bar in range(8):
        chord=chords[bar%4];start=bar*3
        if track<2:
            for beat in range(6):note(chord[[0,2,1,3,2,1][beat]]+(12 if beat%3 else 0),start+beat*.5,1.8,.18,track)
            note(chord[0]-12,start,2.9,.09,track)
        else:
            for m in chord:note(m,start,2.95,.07,2)
            for beat in range(4):note(chord[(beat+bar)%4]+12,start+beat*.75,1.1,.09,0)
    peak=max(abs(v) for v in samples) or 1
    data=bytearray()
    for i,v in enumerate(samples):
        fade=min(1,i/(RATE*.15),(N-1-i)/(RATE*.25))
        data.extend(struct.pack('<h',int(v/peak*.3*32767*fade)))
    with wave.open(str(OUT/f'hold-music{track+1}.wav'),'wb') as wav:wav.setparams((1,2,RATE,0,'NONE','not compressed'));wav.writeframes(data)
print('Drei eigene Wartemusiken erstellt: Klavier, Akustik und Lounge.')
