/**
 * Description - CelerFT.js is a JavaScript library providing multiple simultaneous, resumable uploads via the HTML5 File API.
 *               The library is designed to introduce fault tolerance into the upload of large files over HTTP. This done
 *               by splitting the file into small chunks and uplaoding the chunks in parallel to the backend server. Whenever an
 *               upload fails the uplaod is retried until is completed. In addition to this the upload can be paused or canceled at any
 *               and the resumed at the point as which it was left off.
 *                             
 * Author - Nigel Thomas
 * 
 * Copyright 2016 by Nigel Thomas<nigelbtomas@gmail.com>
 * 
 *  */

(function () {

    "use strict";


    var CelerFT = function (options) {


        var workers = [];

        function updateProgress(percent, id) {

            if (percent > 100) {
                percent = 100;
            }

            var p = percent + "%";
            $(options.uicontrols.progressbarid + id).width(p);
            $(options.uicontrols.progressbarid + id).data("percentage", percent);
            $(options.uicontrols.progressbarid  + id).text(p);
        }

        function CancelUpload(e) {
            e.preventDefault();
            e.stopPropagation();

            for (var i = 0; i < workers.length; i++) {

                workers[i].terminate();
            }

            $(options.uicontrols.errorcontrolid).append('<p> File uploads terminated by user request. </p>');
        };


        function PauseUpload(e) {
            e.preventDefault();
            e.stopPropagation();
            alert("Not implemented");
        };

        function UploadHandler(e) {
            e.preventDefault();
            e.stopPropagation();

            if ($(options.uicontrols.directoryselectorid).val() == '') {
                alert("Please enter a directory name to upload the file to.");
                $(options.uicontrols.directoryselectorid).focus();
                return;
            }

            if ($(options.uicontrols.fileselectorid).val() == '') {
                alert("Please select a file and/or files to upload.");
                $(options.uicontrols.fileselectorid).focus();
                return;
            }


            // Get the selected file and/or files
            var files = $(options.uicontrols.fileselectorid)[0].files;

            // Check that we are uploading no more than 5 files
            if (files.length > options.maxFiles) {
                alert("We can only upload " + options.maxFiles + " files at a time.");
                $(options.uicontrols.fileselectorid)[0].value = '';
                return;
            }

            // set the bytes per chunk
            switch ($(options.uicontrols.selectbytesperchunkid + " option:selected").text()) {

                case '50MB':
                    options.bytesperchunk = 50 * 1024 * 1024;
                    break;
                case '20MB':
                    options.bytesperchunk = 20 * 1024 * 1024;
                    break;
                case '10MB':
                    options.bytesperchunk = 10 * 1024 * 1024;
                    break;
                case '5MB':
                    options.bytesperchunk = 5 * 1024 * 1024;
                    break;
                case '2MB':
                    options.bytesperchunk = 2 * 1024 * 1024;
                    break;
                case '1MB':
                    options.bytesperchunk = 1 * 1024 * 1024;
                    break;
                case '500K':
                    options.bytesperchunk = 500 * 1024;
                    break;
                case '256K':
                    options.bytesperchunk = 256 * 1024;
                case '128K':
                    options.bytesperchunk = 128 * 1024;
                    break;
                case '64K':
                    options.bytesperchunk = 64 * 1024;
                    break;
                default:
                    options.bytesperchunk = 1 * 1024 * 1024;
            }

            // Check if we are going to do an async upload of a large file
            if ($(options.uicontrols.selectasnycstateid).prop('checked')) {
                options.uploadlargfileasync = true;
            }


            // Check to see if backend supports X-file-Name
            if ($(options.uicontrols.selectxfilenameid).prop('checked')) {
                options.xfilenameuploads = true;
            }

            // create the workers
            for (var i = 0; i < files.length; i++) {

                var file = files[i];

                // Update the table with the file name
                $(options.uicontrols.tdfileid + i).text(file.name);


                // Create the file processing web worker
                var worker = new Worker("Scripts/celerftworker.js");

                worker.onmessage = function (e) {
                    var response = e.data;

                    switch (response.action) {

                        // Dispaly messages sent by the web worker
                        case 'msg':
                            alert(JSON.stringify(response.message));
                            break;
                        // Update the progressbar
                        case 'progress':
                            updateProgress(response.percentage, response.id);
                            break;
                        case 'updatelocalchecksum':
                            $(options.uicontrols.tdlocalchecksumid + response.id).text(response.checksum);
                            break;
                        case 'updateremotechecksum':
                            $(options.uicontrols.tdremotechecksumid + response.id).text(response.checksum);
                            break;
                        // Update legend of the progressbar
                        case 'updatelegend':
                            $(options.uicontrols.fieldsetid + response.id).children('legend:first').text(response.message);
                            break;
                        // Show error messages and stop the worker
                        case 'error':
                            $(options.uicontrols.errorcontrolid).append('<p>' + response.message + '</p>');

                            for (var j = 0; j < workers.length; j++) {
                                workers[j].terminate();
                            };

                            break;
                    }
                    
                }
                
                var workerargs = {

                    action: 'start',
                    bytesperchunk: options.bytesperchunk,
                    defaultuploadaction: 'upload',
                    file: file,
                    id: i,
                    maxParallelUploads: options.maxParallelUploads,
                    uploaddirectory: $(options.uicontrols.directoryselectorid).val(),
                    uploadlargfileasync: options.uploadlargfileasync,
                    urls: options.urls,
                    xfilenameuploads: options.xfilenameuploads
                }

                // Check if we are going to upload the file chunks in parallel
                if ($(options.uicontrols.selectparalleluploadid).prop('checked')) {
                    workerargs.action = 'startparallel';
                }

                // Check if we are resumimg an upload
                if (this.id == options.uicontrols.resumebuttonid) {
                    workerargs.action = 'resume';

                    if ($(options.uicontrols.selectparalleluploadid).prop('checked')) {
                        workerargs.resumetype = 'parallel';
                    }
                    else {
                        workerargs.resumetype = 'normal';
                    }
                }

                worker.onerror = function (e) { $(options.uicontrols.errorcontrolid).append(e.message); }

                worker.postMessage(workerargs);
                workers.push(worker);
            }

        };


       this.init = function() {

           // Hook up events to the UI
           if ((options.uicontrols.cancelbuttonid !== undefined) && (typeof CancelUpload == 'function')) {

               var cancelbtn = document.getElementById(options.uicontrols.cancelbuttonid);
               cancelbtn.addEventListener("click", CancelUpload, false);
           
           }

           if ((options.uicontrols.pausebuttonid !== undefined) && (typeof PauseUpload == 'function')) {

               var pausebtn = document.getElementById(options.uicontrols.pausebuttonid);
               pausebtn.addEventListener("click", PauseUpload, false);
           }

           if ((options.uicontrols.resumebuttonid !== undefined) && (typeof UploadHandler == 'function')) {

               var resumebtn = document.getElementById(options.uicontrols.resumebuttonid);
               resumebtn.addEventListener("click", UploadHandler, false);
           }

           if ((options.uicontrols.uploadbuttonid !== undefined) && (typeof UploadHandler == 'function')) {

               var uploadbtn = document.getElementById(options.uicontrols.uploadbuttonid);
               uploadbtn.addEventListener("click", UploadHandler, false);
           }

        };

        
    };

    window.CelerFT = CelerFT;
})();