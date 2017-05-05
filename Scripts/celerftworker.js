/**
 * Description - Celerftworker.js is the primary web worker for CelerFT. This web worker accepts a file and uses
 *               the FileReader API to split the file into chunks for upload.
 *
 *               The primary web work does the the following:
 *                  1) Uses the FileReader API to split the file into chunks. The file chunks are sent to the another web worker
 *                     for uploading to the backend. The numer of chunks sent to the uploader is configurable.
 *                  2) Updates the progress bar based on events raised by the web worker that does the uploading.
 *                  3) Once the last file chunk is uploaded it signals another web worker to merge the file chunks into the file.
 *                  3) Once the file is merged it signals other web workers to generate the checksum of the file. This
 *                     is the checksum for the local file and the checksum for the remote file. We use the CryptoMD5 library to
 *                     calculate the MD5 file checksum for the local file.
 *                             
 * Author - Nigel Thomas
 * 
 * Copyright 2016 by Nigel Thomas<nigelbtomas@gmail.com>
 * 
 *  */


(function () {

    "use strict";

    // We have to use a polyfill to get sub web workers to work in Chrome.
    // As detailed here Chrome does not support sub web workers https://bugs.chromium.org/p/chromium/issues/detail?id=31666
    importScripts("subworkers.js");

    // MD5 checksum libraray https://github.com/satazor/SparkMD5
    importScripts('spark-md5.js');

    // Custom event handler for generating the checksum
    var getCheckSumevt = new CustomEvent('GenerateChecksum');

    // Data to be passed to the getchecksum function
    var checksumdata = {};

    // Event listener for message event
    self.addEventListener('message', function (e) {

        var workerargs = e.data;
        switch (workerargs.action) {

            case 'start': startProcessing(workerargs.bytesperchunk, workerargs.defaultuploadaction, workerargs.file, workerargs.id, workerargs.uploaddirectory, workerargs.uploadlargfileasync, workerargs.urls, workerargs.xfilenameuploads);
                break;
            case 'startparallel': startProcessingSimultaneously(workerargs.bytesperchunk, workerargs.defaultuploadaction, workerargs.file, workerargs.id, workerargs.maxParallelUploads, workerargs.uploaddirectory, workerargs.uploadlargfileasync, workerargs.urls, workerargs.xfilenameuploads);
                break;
            case 'resume': startProcessingWithResume(workerargs.bytesperchunk, workerargs.file, workerargs.id, workerargs.maxParallelUploads, workerargs.resumetype, workerargs.uploaddirectory, workerargs.uploadlargfileasync, workerargs.urls, workerargs.xfilenameuploads);
                break;

        }
    });

    // Event listener for GenerateChecksum event
    self.addEventListener('GenerateChecksum', function (e) {
        startGeneratingChecksum(checksumdata.bytesperchunk, checksumdata.checksumurl, checksumdata.file, checksumdata.id, checksumdata.uploaddirectory)
    });



    // Create the merge all chunks web worker
    var mergeAllChunks = function (chunkmetadata, id, getCheckSumevt, uploaddirectory, urls) {

        var mergeallworker = new Worker("celerftmergeall.js");

        mergeallworker.onmessage = function (e) {
            var response = e.data;

            switch (response.action) {

                case 'mergecompleted': mergeallworker.terminate();
                    break;
                case 'msg': self.postMessage({ 'action': 'msg', 'message': response.message });
                    break;
                case 'updatelegend': self.postMessage({ 'action': 'updatelegend', 'message': response.message, 'id': id });
                    break;

            }

            // Generate the checksum
            if (response.action == 'mergecompleted') {
                self.dispatchEvent(getCheckSumevt);
            }
        

        };

        mergeallworker.onerror = function (e) {
            self.postMessage({ 'action': 'error', 'message': e.message });
        }

        var mergeallargs = {

            action: 'merge',
            chunkmetadata: chunkmetadata,
            mergeallurl: urls.mergeallurl,
            uploaddirectory: uploaddirectory
        }

        mergeallworker.postMessage(mergeallargs);

    }

    // The ideal scenario is to create a sub web worker to calculate the local file checksum.
    // However because Chrome does not support sub web workers that method will not work.
    // We have to do this in the main web worker. We will use a sub web worker to get the remote file checksum.
    var getLocalFileCheckSum = function (bytesperchunk, file, id) {

        var blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;

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
                self.postMessage({ 'action': 'updatelocalchecksum', 'checksum': md5hash.toUpperCase(), 'id': id });
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


    function startProcessing(bytesperchunk, defaultuploadaction, file, id, uploaddirectory, uploadlargfileasync, urls, xfilenameupload) {

        // Populate the checksum data variable
        checksumdata.bytesperchunk = bytesperchunk;
        checksumdata.file = file;
        checksumdata.id = id;
        checksumdata.uploaddirectory = uploaddirectory;
        checksumdata.checksumurl = urls.checksumurl;

        // Create the data for the chunk uploads
        var chunkmetadata = {

            currentChunk: 1,
            endbyte: bytesperchunk,
            filename: file.name,
            filesize: file.size,
            numberOfUploadedChunks: 0,
            startbyte: 0,
            starttime: new Date(),
            totalNumberOfChunks: Math.ceil(file.size / bytesperchunk)
        }
        
        var uploadargs = {
            
            action: defaultuploadaction,
            chunkmetatdata : chunkmetadata,
            uploaddirectory : uploaddirectory,
            uploadlargfileasync : uploadlargfileasync,
            uploadurl : urls.uploadurl,
            xfilenameupload: xfilenameupload
        }

        var getNextChunk = function () {

            if (chunkmetadata.numberOfUploadedChunks == chunkmetadata.totalNumberOfChunks) {
                uploadworker.terminate();
                mergeAllChunks(chunkmetadata, id, getCheckSumevt, uploaddirectory, urls);
            }

            if (chunkmetadata.startbyte > chunkmetadata.filesize) {
                uploadworker.terminate();
                return;
            }

            // Get the next file chunk
            var chunk = file.slice(chunkmetadata.startbyte, chunkmetadata.endbyte);

            uploadargs.chunk = chunk;

            if (defaultuploadaction == 'resume') {
                uploadargs.chunkinfourl = urls.chunkinfourl;
                uploadargs.fileinfourl = urls.fileinfourl;
            }

            uploadworker.postMessage(uploadargs);

            chunkmetadata.currentChunk++;
            chunkmetadata.numberOfUploadedChunks++;
            chunkmetadata.startbyte = chunkmetadata.endbyte;
            chunkmetadata.endbyte = chunkmetadata.startbyte + bytesperchunk;

        }

        // Create the  chunk uploading web worker
        var uploadworker = new Worker("celerftuploader.js");

        uploadworker.onmessage = function (e) {
            var response = e.data;

            switch (response.action) {

                case 'next': getNextChunk();
                    break;
                case 'msg': self.postMessage({'action': 'msg', 'message': response.message});
                    break;
                case 'progress': self.postMessage({ 'action': 'progress', 'percentage': response.percentage, 'id': id });
                    break;
                case 'updatelegend': self.postMessage({ 'action': 'updatelegend', 'message': response.message, 'id': id });
                    break;
                case 'uploadcompleted': uploadworker.terminate(); self.dispatchEvent(getCheckSumevt);
                    break;

            }

        }

        uploadworker.onerror = function (e) {
            self.postMessage({ 'action': 'error', 'message': e.message });
        }

        // Clear the legend
        self.postMessage({ 'action': 'updatelegend', 'message': '', 'id': id });

        // Clear checksum
        self.postMessage({ 'action': 'updatelocalchecksum', 'checksum': '', 'id': id });
        self.postMessage({ 'action': 'updateremotechecksum', 'checksum': '', 'id': id });

        // Get the first file chunk and send it to the upload worker
        // After the chunk has been uplaoded we wll call getnextchunk to get all other
        // file chunks for uploading
        //for (var i = 0; i < 2; i++) {
            getNextChunk();
        //}
        


    }

    
    function startProcessingSimultaneously(bytesperchunk, defaultuploadaction, file, id, maxParallelUploads, uploaddirectory, uploadlargfileasync, urls, xfilenameupload) {
        
        // Turn off async upload for parallel files
        /*if (uploadlargfileasync == true) {
            
            uploadlargfileasync = false;
        }*/
        
        // Populate the checksum data variable
        checksumdata.bytesperchunk = bytesperchunk;
        checksumdata.file = file;
        checksumdata.id = id;
        checksumdata.uploaddirectory = uploaddirectory;
        checksumdata.checksumurl = urls.checksumurl;
        
        // Create the data for the chunk uploads
        var chunkmetadata = {
            
            currentChunk: 1,
            endbyte: bytesperchunk,
            filename: file.name,
            filesize: file.size,
            numberOfUploadedChunks: 0,
            startbyte: 0,
            starttime: new Date(),
            totalNumberOfChunks: Math.ceil(file.size / bytesperchunk)
        }
        
        // Array of webworkers
        var uploadworkers = [];
        
        // Maximum number of workers to create
        var maxuploadworker = Math.min(maxParallelUploads, chunkmetadata.totalNumberOfChunks)
        
        // Create the  chunk uploading web worker
        var uploadworker = new Worker("celerftuploader.js");
        
        uploadworker.onmessage = function (e) {
            
            var response = e.data;
            
            switch (response.action) {
                case 'next': getNextChunk();
                    break;
                case 'msg': self.postMessage({ 'action': 'msg', 'message': response.message });
                    break;
                case 'progress': self.postMessage({ 'action': 'progress', 'percentage': response.percentage, 'id': id });
                    break;
                case 'updatelegend': self.postMessage({ 'action': 'updatelegend', 'message': response.message, 'id': id });
                    break;
                case 'uploadcompleted': uploadworker.terminate(); self.dispatchEvent(getCheckSumevt);
                    break;
            }
        }
        
        uploadworker.onerror = function (e) {
            self.postMessage({ 'action': 'error', 'message': e.message });
        } 
        
        // Generate the read positions for slicing the file into chunks
        // and add to array
        function FileChunk(startbyte, endbyte) {
            this.startbyte = startbyte;
            this.endbyte = endbyte;

        }
        
        var start = 0;
        var end = bytesperchunk;
        var SIZE = file.size;
        var filechunks = [];
        while (start < SIZE) {
            
            //var filechunk = new FileChunk(start, end);
            filechunks.push(new FileChunk(start, end));

            start = end;
            end = start + bytesperchunk;
            
        }
        

        var getNextChunk = function () {
            
            /*if (chunkmetadata.numberOfUploadedChunks == chunkmetadata.totalNumberOfChunks) {
                uploadworker.terminate();
                mergeAllChunks(chunkmetadata, id, getCheckSumevt, uploaddirectory, urls);
            }*/
            
            /*if (chunkmetadata.startbyte > chunkmetadata.filesize) {
                uploadworker.terminate();
                return;
            }*/
            
            if (filechunks.length == 0) {
                //uploadworker.terminate();
                mergeAllChunks(chunkmetadata, id, getCheckSumevt, uploaddirectory, urls);
            }
            
            
            // Upload the file chunks
            if (filechunks.length != 0) {
                
                var filechk = filechunks.shift();
                var chunk = file.slice(filechk.startbyte, filechk.endbyte);
                
                var uploadargs = {
                    
                    action: defaultuploadaction,
                    chunk : chunk,
                    chunkmetatdata : chunkmetadata,
                    uploaddirectory : uploaddirectory,
                    uploadlargfileasync : uploadlargfileasync,
                    uploadurl : urls.uploadurl,
                    xfilenameupload: xfilenameupload
                }
                
                if (defaultuploadaction == 'resume') {
                    uploadargs.chunkinfourl = urls.chunkinfourl;
                    uploadargs.fileinfourl = urls.fileinfourl;
                }
                
                uploadworker.postMessage(uploadargs);
                
                chunkmetadata.currentChunk++;
                chunkmetadata.numberOfUploadedChunks++;
                chunkmetadata.startbyte = filechk.endbyte;
                chunkmetadata.endbyte = filechk.startbyte + bytesperchunk;
            }
            

        }
        
        // Clear the legend
        self.postMessage({ 'action': 'updatelegend', 'message': '', 'id': id });
        
        // Clear checksum
        self.postMessage({ 'action': 'updatelocalchecksum', 'checksum': '', 'id': id });
        self.postMessage({ 'action': 'updateremotechecksum', 'checksum': '', 'id': id });
        
        // Start uploading
        for (var i = 0; i < maxuploadworker; i++) {
            getNextChunk();
        }


    }

    function startProcessingWithResume(bytesperchunk, file, id, maxParallelUploads, resumetype, uploaddirectory, uploadlargfileasync, urls, xfilenameupload) {

        var defaultuploadaction = 'resume';

        if (resumetype == 'normal') {

            startProcessing(bytesperchunk, defaultuploadaction, file, id, uploaddirectory, uploadlargfileasync, urls, xfilenameupload);
        }

        if (resumetype == 'parallel') {

            startProcessingSimultaneously(bytesperchunk, defaultuploadaction, file, id, maxParallelUploads, uploaddirectory, uploadlargfileasync, urls, xfilenameupload);
        }
    }


    function startGeneratingChecksum(bytesperchunk, checksumurl, file, id, uploaddirectory) {

        // Get the local file checksum
        getLocalFileCheckSum(bytesperchunk, file, id);

        // Create the web worker for generating the remote file checksum
        var remotechecksumworker = new Worker("celerftgetchecksum.js");

        remotechecksumworker.onmessage = function (e) {

            var response = e.data;
            switch (response.action) {

                case 'msg': self.postMessage({ 'action': 'msg', 'message': response.message });
                    break;
                case 'remotechecksum': self.postMessage({ 'action': 'updateremotechecksum', 'checksum': response.checksum, 'id': id });
                    break;
                case 'remotechecksumcompleted': remotechecksumworker.terminate();
                    break;
            }
        }

        remotechecksumworker.onerror = function (e) {
            self.postMessage({ 'action': 'error', 'message': e.message });
        }

        var remotechecksumargs = {

            action: 'getremotechecksum',
            checksumurl: checksumurl,
            file: file,
            uploaddirectory: uploaddirectory
        }

        remotechecksumworker.postMessage(remotechecksumargs);


        // Clear the legend
        //self.postMessage({ 'action': 'updatelegend', 'message': '', 'id': id });
    }


})();

