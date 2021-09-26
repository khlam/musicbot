const commando = require('discord.js-commando')
const ytdl = require('ytdl-core')
const fs = require('graceful-fs')
const levenshtein = require('fast-levenshtein')
const youtube = require('./src/youtubeObj')
const t = require('./src/transcriber')
const gsheet = require('./src/gsheet')

const { performance } = require('perf_hooks')

let musicQueue = []
let msgChannel
let voiceChannel
let voiceChannelConnection

const maxCMDDuration = 4000

let lastExecutedCommandTime = performance.now()

let isTranscribing = false

let authObj = {}
authObj.TOKEN = process.env.TOKEN

let triggerArray
gsheet.init().then(_res => {
    triggerArray = _res
    console.log(`Google sheets fetched, ${triggerArray.length} unique triggers.`)
    //console.log(triggerObj)
})

const client = new commando.CommandoClient({
    commandPrefix: '-'
})

function doTranscribe() {
    voiceChannelConnection.on('speaking', async (user, speaking) => {
        if (isTranscribing === false) {
            isTranscribing = true

            try{

                if (speaking.bitfield == 0 || user.bot) {
                    isTranscribing = false
                    return
                }
                
                const talkStart = performance.now()

                const audioStream = voiceChannelConnection.receiver.createStream(user, { mode: 'pcm'}) // 16-bit signed PCM, stereo 48KHz stream
                
                const userTag = `${user.tag}`.split("#")[1]
                console.log(`#${userTag} speaking`)
                
                let _audioBuffer = []
                _audioBuffer.push(t.initWAVHeader()) // Insert Header

                let _setStatus = false
                
                function _writeData(data) {
                    _audioBuffer.push(data)
                    if (_audioBuffer.length > 50) {
                        if (_setStatus === false) {
                            _setStatus = true
                            globClient.user.setActivity(`👂 to #${userTag}`,"")
                        }
                        if ((performance.now() - talkStart) > maxCMDDuration){
                            console.log("max cmd duration")
                            isTranscribing = false
                            audioStream.removeListener('data', _writeData)
                            audioStream.removeListener('end', _transcribe)
                            globClient.user.setActivity(`max cmd time`,"")
                            return
                        }
                    }
                }

                function _transcribe() {
                    const _finalAudioBuffer = Buffer.concat(_audioBuffer)
                    console.log("\tbuffer length: ", _finalAudioBuffer.toString().length)

                    if (_finalAudioBuffer.toString().length > 100000) {
                        globClient.user.setActivity(`Intrp. #${userTag}`)
                        t.transcribe(_finalAudioBuffer).then(result => {
                            isTranscribing = false
                            interpretCommand(result, userTag)
                        })
                    }else {
                        console.log("\t\tBuffer data too short")
                        isTranscribing = false
                        audioStream.removeListener('data', _writeData)
                        audioStream.removeListener('end', _transcribe)
                        return
                    }
                }

                audioStream.on('data', _writeData)
                audioStream.on('end', _transcribe)

            }catch(e){
                console.log("ERROR", e)
                globClient.user.setActivity(`done`)
                isTranscribing = false
                return
            }
        }
    })
}

Array.prototype.insert = function ( index, item ) {
    this.splice( index, 0, item )
}

function interpretCommand(_rawTranscript, userTag) {
    const rawTranscript = _rawTranscript    // What the system "heard"
    command = rawTranscript.replace(/\s/g, '') // remove spaces
    let currentCommandTime = performance.now()
    
    globClient.user.setActivity(`done`,"")

    if (currentCommandTime - lastExecutedCommandTime > 3000) {

        // 1) Skip song
        if ((levenshtein.get(command, 'skipsong') <= 3)) {
            lastExecutedCommandTime = currentCommandTime
            skipSong(`👂 #${userTag} "\`${rawTranscript}\`" ➡️ "skip song"\t`)
        }else
        
        // 2) Leave the channel and clear all songs
        if (levenshtein.get(command, 'leavechannel') <= 4 || levenshtein.get(command, 'leave') <= 2) {
            msgChannel.channel.send(`👂 #${userTag} "\`${rawTranscript}\`" ➡️ "leave channel"\t`)
            lastExecutedCommandTime = currentCommandTime
            musicQueue = []
            voiceChannel.join().then(() => {
                isTranscribing = false
                voiceChannel.leave()
            })
        }else {
            // Run Custom Command
            let _objToPlay = false
            let _consumedTrigger = false

            if (triggerArray !== undefined){
                triggerArray.forEach(triggerObj => {
                    let _triggerWord = triggerObj.trigger
                    let _lev = triggerObj.lev
                    let _ytObj = triggerObj.ytObj
                    if (levenshtein.get(command, _triggerWord) <= _lev){
                        _objToPlay = _ytObj
                        _consumedTrigger = _triggerWord
                        return
                    }
                })
                if (_objToPlay !== false && _consumedTrigger !== false){
                    musicQueue.push(_objToPlay)
                    msgChannel.channel.send(`👂 #${userTag} "\`${rawTranscript}\`" ➡️ "${_consumedTrigger}" <${_objToPlay.address}>`)
                    if (musicQueue.length === 1){ // If there was no song playing before the last song was added then there will be 1 song in queue
                        setTimeout(() => {
                            _playSong(voiceChannelConnection)
                        }, 500)
                    }
                }
            }
        }
    }
}

function skipSong(extraString=""){
    if (musicQueue.length !== 0){
        msgChannel.channel.send(`${extraString}**Skipped** \t *${musicQueue[0].name}*`)
        musicQueue.shift()
        setTimeout(() => {
            _playSong(voiceChannelConnection)
        }, 500)
    }else{
        if (extraString === "") {
            voiceChannel.join().then(() => {
                isTranscribing = false
                voiceChannel.leave().then(() => {
                    voiceChannel.join()
                })
            })
        }
        return
    }
}

async function _playSong(connection) {
    if (musicQueue.length !== 0) {
        let stream
        if (musicQueue[0].type == "yt") {
            stream = await ytdl(musicQueue[0].address, {
                filter: "audioonly",
                highWaterMark: 1<<25
            })
        }

        if (musicQueue[0].type == "local") {
            stream = await fs.createReadStream(musicQueue[0].address)
        }

        console.log(`Now playing: ${musicQueue[0].name}`)
        
        const dispatcher = connection.play(stream, {volume: 0.4})

        dispatcher.on('finish', () => {
            if(musicQueue.length === 0) {
                console.log("No more songs to be played...")
                musicQueue = []
                /*
                voiceChannel.join().then(() => {
                    isTranscribing = false
                    voiceChannel.leave()
                })*/
            }else {
                skipSong()
            }
        })

    }else if (musicQueue.length === 0){
        console.log("No more songs to be played...")
        try {
            connection.dispatcher.end()
            return
        }catch(e){
            return
        }
        /*
        voiceChannel.join().then(() => {
            isTranscribing = false
            voiceChannel.leave()
        })*/
    }
}

async function _addToQueueAndPlay(msg, _vObj, musicObj) {    
    if (_vObj) {
        msgChannel = msg

        voiceChannel = _vObj

        musicQueue.push(musicObj) // Add music obj to queue

        console.log(`Added ${musicObj.name} to music queue`)
        
        msgChannel.channel.send(`**#${musicQueue.length}** \t *${musicObj.name}*\t \`${musicObj.length}\``)
        
        if(voiceChannel) {
            voiceChannelConnection = await voiceChannel.join()
            doTranscribe()

            if (musicQueue.length === 1){ // If there was no song playing before the last song was added then there will be 1 song in queue
                await _playSong(voiceChannelConnection)
            }
        }else {
            console.log(musicQueue)
        }

    }else {
        msg.channel.send(`**Queue Error** Requestor is not connected to a visible voice channel.`)
    }
}

async function _joinChannel(msg, _vObj) {
    msgChannel = msg
    if (_vObj) {
        voiceChannel = _vObj
        
        console.log("Joining channel")
    
        if(voiceChannel) {
            voiceChannelConnection = await voiceChannel.join()
            doTranscribe()
        }
    }else {
        msgChannel.channel.send(`**Queue Error** Requestor is not connected to a visible voice channel.`)
    }
}

const playYT = class extends commando.Command {
    constructor(client) {
        super(client, {
            name: 'p',
            group: 'music',
            aliases: ['play'],
            memberName: 'play',
            description: 'Queue a song for the bot to play.',
            argsType: 'single'
        })
    }

    async run(msg, youtubeURL) {
        let _videoObj = await youtube.getYoutubeObj(youtubeURL)
        if(_videoObj !== false) {
            msgChannel = msg
            await _addToQueueAndPlay(msg, msg.member.voice.channel, _videoObj)
        }
    }
}

const playDemo = class extends commando.Command {
    constructor(client) {
        super(client, {
            name: 'demo',
            group: 'music',
            memberName: 'demo',
            description: 'Plays demo.',
            argsType: 'single'
        })
    }

    async run(msg) {
        msgChannel = msg
        let _musicObj = {
            name: `demo`,
            length: "00:03:26",
            type: "local",
            address: `${__dirname}/../audio/demo.mp3`
        }

        await _addToQueueAndPlay(msg, msg.member.voice.channel, _musicObj)
    }
} 

const skip = class extends commando.Command {
    constructor(client) {
        super(client, {
            name: 's',
            group: 'music',
            aliases: ['skip'],
            memberName: 'skip',
            description: 'Skips whatever is currently playing.',
            argsType: 'single'
        })
    }

    async run(msg) {
        msgChannel = msg
        if( musicQueue.length !== 0) {
            console.log(`Skipping ${musicQueue[0].name}`)
            msg.channel.send(`**Skipped** \t *${musicQueue[0].name}*`)
            if(musicQueue.length === 0) {
                console.log("No more songs to be played...")
                musicQueue = []
                isTranscribing = false
                //voiceChannel.leave()
            }else {
                skipSong()
            }
        }
    }
}

const join = class extends commando.Command {
    constructor(client) {
        super(client, {
            name: 'join',
            group: 'misc',
            aliases: ['join'],
            memberName: 'join',
            description: 'Joins channel',
            argsType: 'single'
        })
    }

    async run(msg) {
        msgChannel = msg
        await _joinChannel(msg, msg.member.voice.channel)
    }
}

const leave = class extends commando.Command {
    constructor(client) {
        super(client, {
            name: 'leave',
            group: 'misc',
            aliases: ['leave'],
            memberName: 'leave',
            description: 'Leaves channel',
            argsType: 'single'
        })
    }

    async run(msg) {
        msgChannel = msg
        try {
            voiceChannel.leave()
        }catch(e){
            return   
        }
    }
}

const pull = class extends commando.Command {
    constructor(client) {
        super(client, {
            name: 'pull',
            group: 'misc',
            aliases: ['pull'],
            memberName: 'pull',
            description: 'pull google sheet',
            argsType: 'single'
        })
    }

    async run(msg) {
        msgChannel = msg
        msgChannel.channel.send(`Pulling info from Google Sheet (this may take a few seconds)... <${process.env.GSHEET}>`)
        console.log("Pulling info from Google Sheet...")
        gsheet.init().then(_res => {
            triggerArray = _res
            console.log("Google sheet pull done.")
            msgChannel.channel.send(`Google sheet pull complete. ${triggerArray.length} unique triggers.`)
            //console.log(triggerObj)
        })
    }
}


client.login(authObj.TOKEN)

client.registry
    .registerDefaultTypes()
    .registerGroups([
        ['music', 'music commands'],
        ['misc', 'misc commands']
    ])
    .registerDefaultGroups()
    .registerDefaultCommands({
        prefix: false,
        eval: false,
        groups: false,
        enable: false,
        disable: false,
        load: false,
        unload: false
    }).registerCommands([playYT, playDemo, skip, join, pull, leave])

client.on('ready', () => {
    console.log("Music Bot has logged in.")
    client.user.setActivity(`000`)
    globClient = client
})

process.once('SIGTERM', function (code) {
    console.log('SIGTERM. Shutting down.')
    process.exit()
})