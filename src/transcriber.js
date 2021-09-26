const DeepSpeech = require('deepspeech')
const Sox = require('sox-stream')
const MemoryStream = require('memory-stream')
const Duplex = require('stream').Duplex

let modelPath = '/app/models/deepspeech-0.9.3-models.pbmm'
let model = new DeepSpeech.Model(modelPath)
const desiredSampleRate = model.sampleRate()

function bufferToStream(buffer) {
	let stream = new Duplex()
	stream.push(buffer)
	stream.push(null)
	return stream
}

function transcribe(_buf) {
    return new Promise(function (resolve, reject) {
        let memStream = new MemoryStream()

        bufferToStream(_buf).pipe(Sox({
            global: {
                'no-dither': true,
            },
            output: {
                bits: 16,
                rate: desiredSampleRate,
                channels: 1,
                encoding: 'signed-integer',
                endian: 'little',
                compression: 0.0,
                type: 'raw'
            }
        })).pipe(memStream)

        memStream.on('finish', () => {
            let audioBuffer = memStream.toBuffer()
            let result = model.stt(audioBuffer)

            isTranscribing = false

            console.log("a Size:", audioBuffer.toString().length)

            console.log("\tRESULT:", result)
            
            return resolve(result)
        })
    })
}

// Source: https://github.com/TooTallNate/node-wav/blob/master/lib/writer.js
function initWAVHeader() {
    var MAX_WAV = 4294967295 - 100
    var bufferAlloc = require('buffer-alloc');
    var bufferFrom = require('buffer-from');
    var RIFF = bufferFrom('RIFF');
    var WAVE = bufferFrom('WAVE');
    var fmt = bufferFrom('fmt ');
    var data = bufferFrom('data');

    this.endianness = 'LE';
    this.format = 1; // raw PCM
    this.channels = 2;
    this.sampleRate = 44100;
    this.bitDepth = 16;
    this.bytesProcessed = 0;

    var headerLength = 44;

    var dataLength = this.dataLength;
    if (dataLength == null) {
      dataLength = MAX_WAV;
    }
    var fileSize = dataLength + headerLength;
    var header = bufferAlloc(headerLength);
    var offset = 0;
  
    // write the "RIFF" identifier
    RIFF.copy(header, offset);
    offset += RIFF.length;
  
    // write the file size minus the identifier and this 32-bit int
    header['writeUInt32' + this.endianness](fileSize - 8, offset);
    offset += 4;
  
    // write the "WAVE" identifier
    WAVE.copy(header, offset);
    offset += WAVE.length;
  
    // write the "fmt " sub-chunk identifier
    fmt.copy(header, offset);
    offset += fmt.length;
  
    // write the size of the "fmt " chunk
    // XXX: value of 16 is hard-coded for raw PCM format. other formats have
    // different size.
    header['writeUInt32' + this.endianness](16, offset);
    offset += 4;
  
    // write the audio format code
    header['writeUInt16' + this.endianness](this.format, offset);
    offset += 2;
  
    // write the number of channels
    header['writeUInt16' + this.endianness](this.channels, offset);
    offset += 2;
  
    // write the sample rate
    header['writeUInt32' + this.endianness](this.sampleRate, offset);
    offset += 4;
  
    // write the byte rate
    var byteRate = this.byteRate;
    if (byteRate == null) {
      byteRate = this.sampleRate * this.channels * this.bitDepth / 8;
    }
    header['writeUInt32' + this.endianness](byteRate, offset);
    offset += 4;
  
    // write the block align
    var blockAlign = this.blockAlign;
    if (blockAlign == null) {
      blockAlign = this.channels * this.bitDepth / 8;
    }
    header['writeUInt16' + this.endianness](blockAlign, offset);
    offset += 2;
  
    // write the bits per sample
    header['writeUInt16' + this.endianness](this.bitDepth, offset);
    offset += 2;
  
    // write the "data" sub-chunk ID
    data.copy(header, offset);
    offset += data.length;
  
    // write the remaining length of the rest of the data
    header['writeUInt32' + this.endianness](dataLength, offset);
    offset += 4;
  
    // save the "header" Buffer for the end, we emit the "header" event at the end
    // with the "size" values properly filled out. if this stream is being piped to
    // a file (or anything else seekable), then this correct header should be placed
    // at the very beginning of the file.
    this._header = header;
    this.headerLength = headerLength;
  
    return header
}

module.exports = {transcribe, bufferToStream, initWAVHeader}