const ytdl = require('ytdl-core')

// idk what to name this file
async function getYoutubeObj(URL) {
    if(ytdl.validateURL(URL)) {
        try {
            let info = await ytdl.getInfo(URL)
            //console.log(URL)
            let _videoObj = {
                name: `${info.videoDetails.title.substring(0, 30)}...`,
                length: new Date(info.videoDetails.lengthSeconds * 1000).toISOString().substr(11, 8),
                type: "yt",
                address: URL
            }
            //console.log(_videoObj)
            return _videoObj
        }catch(e) {
            console.log(`${e}`)
            let _videoObj = {
                name: `${URL.substring(5, 15)}`,
                length: "ERR",
                type: "yt",
                address: URL
            }
            return _videoObj
        }
    }else {
        return false
    }
}

module.exports = { getYoutubeObj }