/**
 * Description - Celerftgetchecksum.js is the web worker that gets the MD5 checksum for the local and remote copies of the file. 
 *               This web worker uses XMLHttpRequest Level 2 objects and the spark-md5 library.
 *
 *                             
 * Author - Nigel Thomas
 * 
 * Copyright 2016 by Nigel Thomas<nigelbtomas@gmail.com>
 * 
 *  */

(function () {

    "use strict";

    // MD5 checksum libraray https://github.com/satazor/SparkMD5
    importScripts('spark-md5.js');

    self.addEventListener('message', function (e) {

        var workerargs = e.data;
        switch (workerargs.action) {

            case 'getlocalchecksum': getLocalFileCheckSum(workerargs.bytesperchunk, workerargs.file);
                break;
            case 'getremotechecksum': getRemoteFileCheckSum(workerargs.checksumurl, workerargs.file, workerargs.uploaddirectory);
                break;

        }
    });

    // Function used to generate file checksum
    // Using asynchronous file reader in the webworker
    function getLocalFileCheckSum(bytesperchunk, file) {

        var blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;
        //var blobSlice = file.slice;

        // Size of the file
        var SIZE = file.size;

        // The total number of file chunks
        var chunks = Math.ceil(file.size / bytesperchunk);
        var currentChunk = 0;

        var fileReader = new FileReader();

        // SparkMD5 MD5 checksum generator variable
        var spark = new SparkMD5.ArrayBuffer();

        fileReader.onload = function (e) {

            spark.append(e.target.result);  
            currentChunk++;

            if (currentChunk < chunks) {
                loadNext();
            }
            else {

                // Update the UI with the checksum
                var md5hash = spark.end();
                self.postMessage({ 'action': 'localchecksum', 'checksum': md5hash.toUpperCase() });
                self.postMessage({ 'action': 'localchecksumcompleted' });
            }
        };

        fileReader.onerror = function () {
            self.postMessage({ 'action': 'error', 'message': e.message });
        };

        function loadNext() {

            var start = currentChunk * bytesperchunk,
                end = ((start + bytesperchunk) >= file.size) ? file.size : start + bytesperchunk;

            fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
        }

        loadNext();


    }

    // Function used to send the request to the server to calculate the file checksum
    function getRemoteFileCheckSum(checksumurl, file, uploaddirectory) {

        var xhr = new XMLHttpRequest();

        xhr.onreadystatechange = function (e) {

            if (this.readyState == 4 && this.status == 200) {

                // Update the UI with the checksum
                var md5hash = this.responseText;
                self.postMessage({ 'action': 'remotechecksum', 'checksum': md5hash });
                self.postMessage({ 'action': 'remotechecksumcompleted' });
                self.close();
            }

            // A 400 message indicates that the file does not exists as yet
            // So queue up the checksum request to run in 30 seconds
            if (this.readyState == 4 && this.status == 400) {

                setTimeout(function () { getRemoteFileCheckSum(checksumurl, file, uploaddirectory); }, 5000);
            }

            if (this.readyState == 4 && this.status == 502) {

                setTimeout(function () { getRemoteFileCheckSum(checksumurl, file, uploaddirectory); }, 5000);
            }

            if (this.readyState == 4 && this.status == 503) {

                setTimeout(function () { getRemoteFileCheckSum(checksumurl, file, uploaddirectory); }, 5000);
            }

        };

        // Send the request to get the checksum
        xhr.open('GET', checksumurl + '/?filename=' + file.name + '&directoryname=' + uploaddirectory, false);
        xhr.send(null);
        xhr = null;

    }

})();
