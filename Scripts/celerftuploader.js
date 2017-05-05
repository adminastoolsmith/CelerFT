/**
 * Description - Celerftuploader.js is the web worker that uploads the file chunks to the backend. This web worker uses XMLHttpRequest 
 *               Level 2 objects and FormData objects to send the file chunk to the backend.
 *
 *                             
 * Author - Nigel Thomas
 * 
 * Copyright 2016 by Nigel Thomas<nigelbtomas@gmail.com>
 * 
 *  */

(function () {

    "use strict";
    
    // Flag to check if file exists when doing resume
    var FileUploaded = false;

    self.addEventListener('message', function (e) {

        var workerargs = e.data;
        switch (workerargs.action) {

            case 'upload': doUpload(workerargs.chunk, workerargs.chunkmetatdata, workerargs.uploaddirectory, workerargs.uploadlargfileasync, workerargs.uploadurl, workerargs.xfilenameuploads);
                break;
            case 'resume': doResumeUpload(workerargs.chunk, workerargs.chunkmetatdata, workerargs.uploaddirectory, workerargs.uploadlargfileasync, workerargs.chunkinfourl, workerargs.fileinfourl, workerargs.uploadurl, workerargs.xfilenameuploads);
                break;

        }
    });

    // Function used to create the multipart/form-data in browsers
    // that don't support Formdata
    function buildFormData(chunk) {

        // Transform the data into a base64 string
        var reader = new FileReaderSync();
        var dataUrl = reader.readAsDataURL(chunk);
        var chunkdata = dataUrl.match(/,(.*)$/)[1];

        // Create the form request

        // Hard code the boundary
        var boundary = '----12345678wertysdfg';

        // We start a new part in our body's request
        var data = '';
        data += '--' + boundary + '\r\n' + 'Content-Disposition: form-data; name="Slice"; filename="blob"';
        data += '\r\n';

        // We provide the mime type of the file. In this case it is text for base64 encoded file
        data += 'Content-Type: text/html; charset=UTF-8'
        data += '\r\n';

        // There is always a blank line between the meta-data and the data
        data += '\r\n';

        // We append the binary data to our body's request
        data += chunkdata + '\r\n';

        // Once we are done, we "close" the body's request
        data += '--' + boundary + '--';

        reader = null;

        return data;

    }

    function doUpload(chunk, chunkmetadata, uploaddirectory, uploadlargfileasync, uploadurl, xfilenameuploads) {

        //self.postMessage({'action': 'msg', 'message' : chunkmetadata});
        var xhr = new XMLHttpRequest();

        // xhr.upload causes an error in IE. Use the try catch block to
        // catch the failure in IE, and then upload the progress block in
        // the catch routine.
            try {
                if (uploadlargfileasync == true) {
                    xhr.upload.onprogress = function (e) {

                        if (e.lengthComputable) {
                            var percentage = parseInt((e.loaded * 100 / e.total), 10);
                            self.postMessage({ 'action': 'progress', 'percentage': percentage });
                        }
                        else {
                            var percentage = parseInt((chunkmetadata.currentChunk * 100 / chunkmetadata.totalNumberOfChunks), 10);
                            self.postMessage({ 'action': 'progress', 'percentage': percentage });
                        }

                    }(chunkmetadata);
                }
            }
            catch (e) {

                xhr.onprogress = function (e) {

                    if (e.lengthComputable) {
                        var percentage = parseInt((e.loaded * 100 / e.total), 10);
                        self.postMessage({ 'action': 'progress', 'percentage': percentage });
                    }
                    else {
                        var percentage = parseInt((chunkmetadata.currentChunk * 100 / chunkmetadata.totalNumberOfChunks), 10);
                        self.postMessage({ 'action': 'progress', 'percentage': percentage });
                    }

                }(chunkmetadata);

            }


        xhr.onreadystatechange = function (e) {

            if (this.readyState == 4 && this.status == 201) {

                // Send back progess information for synchronous uploads 
                // The upload.onprogress method only fires on asynchornous uploads
                // and we are doing synchronous uploads
                if (uploadlargfileasync == false) {
                    var percentage = parseInt((chunkmetadata.currentChunk * 100 / chunkmetadata.totalNumberOfChunks), 10);
                    self.postMessage({ 'action': 'progress', 'percentage': percentage });
                }

                self.postMessage({'action' : 'next'});

            }

            if (this.readyState == 4 && this.status == 403) {

                // Tried to upload file that is not multipart/form-data.
                // End the upload
                self.postMessage({ 'action': 'error', 'message': "Upload Error: " + this.responseText });

            }

            if (this.readyState == 4 && this.status == 415) {

                // Tried to upload file that is not multipart/form-data.
                // End the upload
                self.postMessage({ 'action': 'error', 'message': "Upload Error: " + this.responseText });

            }

            if (this.readyState == 4 && this.status == 413) {

                // Tried to upload file that is greater than the maximum file size.
                // End the upload
                self.postMessage({ 'action': 'error', 'message': "Upload Error: " + this.responseText });

            }


            if (this.readyState == 4 && this.status == 500) {

                // Fatal error occured on the server side
                // Send the error message and end the webworker
                self.postMessage({ 'action': 'error', 'message': "Server Error: " + this.responseText });
                //doUpload(chunk, chunkmetadata, uploaddirectory, uploadlargfileasync, uploadurl, xfilenameuploads);

            }

            if (this.readyState == 4 && this.status == 503) {
                
                // Fatal error occured on the server side
                // Send the error message and end the webworker
                //self.postMessage({ 'action': 'error', 'message': "Server Error: " + this.responseText });
                doUpload(chunk, chunkmetadata, uploaddirectory, uploadlargfileasync, uploadurl, xfilenameuploads);

            }


        };


        var formData = '';

        // If the back end supprts X-file-Name just send the chunk as bibary file
        if (xfilenameuploads == true) {

            uploadurl = uploadurl + '/XFileName';
            formData = chunk;
        }

        else if (typeof FormData == "undefined") {

            // The browser does not support the FormData object.
            // We will manually create the from 

            uploadurl = uploadurl + '/Base64';
            formData = buildFormData(chunk);

        }
        else {

            // Browser supports the Formdata object
            // Create the form 

            uploadurl = uploadurl + '/FormData';
            formData = new FormData();
            formData.append("Slice", chunk);

        }

        // Open the url and upload the file chunk
        xhr.open('POST', uploadurl + '?filename=' + chunkmetadata.filename + '&directoryname=' + uploaddirectory + '&chunkNumber=' + chunkmetadata.currentChunk + '&numberOfChunks=' + chunkmetadata.totalNumberOfChunks, uploadlargfileasync);

        // With some browsers we have to set the headers after we do the xhr open request
        if (typeof FormData == "undefined") {

            // Create the form with appropriate header
            xhr.setRequestHeader("Content-Type", "multipart/form-data; boundary=----12345678wertysdfg");
            xhr.setRequestHeader("Content-Length", formData.length);
            xhr.setRequestHeader("CelerFT-Encoded", "base64");
        }

        // Send the form
        xhr.send(formData);

        formData = null;
        xhr = null;

    }
    
    // Function used to check if file uploaded
    function checkIfUploaded(chunkmetadata, fileinfourl, uploaddirectory, uploadlargfileasync) {
        
        var xhr = new XMLHttpRequest();
        
        xhr.onreadystatechange = function (e) {
            
            if (this.readyState == 4 && this.status == 200) {
                
                // The file has been uploaded.
                // Update the progress bar and request the next chunk
                if (uploadlargfileasync == false) {
                    var percentage = parseInt((chunkmetadata.totalNumberOfChunks * 100 / chunkmetadata.totalNumberOfChunks), 10);
                    self.postMessage({ 'action': 'progress', 'percentage': percentage });
                }
                
                self.postMessage({ 'action': 'updatelegend', 'message': chunkmetadata.filename + " already uploaded." });
                self.postMessage({ 'action': 'uploadcompleted' });
                self.close();

                FileUploaded = true;
            }
            

        };
        
        // Send the request to get the checksum
        xhr.open('GET', fileinfourl + '/?filename=' + chunkmetadata.filename + '&directoryname=' + uploaddirectory, false);
        xhr.send(null);
        xhr = null;

    }

    function doResumeUpload(chunk, chunkmetadata, uploaddirectory, uploadlargfileasync, chunkinfourl, fileinfourl, uploadurl, xfilenameuploads) {
        
        // Check if file has been uploaded
        checkIfUploaded(chunkmetadata, fileinfourl, uploaddirectory, uploadlargfileasync)
        
        if (FileUploaded === true) {
            return;
        }

        var xhr = new XMLHttpRequest();

        xhr.onreadystatechange = function (e) {

            if (this.readyState == 4 && this.status == 200) {

                // The file chunk has been uploaded.
                // Update the progress bar and request the next chunk
                if (uploadlargfileasync == false) {
                    var percentage = parseInt((chunkmetadata.currentChunk * 100 / chunkmetadata.totalNumberOfChunks), 10);
                    self.postMessage({ 'action': 'progress', 'percentage': percentage });
                }

                self.postMessage({ 'action': 'next' });

            }

            if (this.readyState == 4 && this.status == 404) {

                // File chunk has not been uploaded
                doUpload(chunk, chunkmetadata, uploaddirectory, uploadlargfileasync, uploadurl, xfilenameuploads);

            }


            if (this.readyState == 4 && this.status == 500) {

                // Fatal error occured on the server side
                // Send the error message and end the webworker
                self.postMessage({ 'action': 'error', 'message': "Server Error: " + this.responseText });

            }


        };


        // Open the url and upload the file chunk
        xhr.open('GET', chunkinfourl + '?filename=' + chunkmetadata.filename + '&directoryname=' + uploaddirectory + '&chunkNumber=' + chunkmetadata.currentChunk, false);
        xhr.send();

        xhr = null;

    }
})();