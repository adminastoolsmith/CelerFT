/**
 * Description - Celerftmergeall.js is the web worker that merges all of the file chunks inot the finla file at the backend. This web worker uses XMLHttpRequest 
 *               Level 2 objects.
 *
 *                             
 * Author - Nigel Thomas
 * 
 * Copyright 2016 by Nigel Thomas<nigelbtomas@gmail.com>
 * 
 *  */

(function () {

    "use strict";

    self.addEventListener('message', function (e) {

        var workerargs = e.data;
        switch (workerargs.action) {

            case 'merge': doMergeAll(workerargs.chunkmetadata, workerargs.mergeallurl, workerargs.uploaddirectory);
                break;

        }
    });

    function doMergeAll(chunkmetadata, mergeallurl, uploaddirectory) {

        var xhr = new XMLHttpRequest();

        xhr.onreadystatechange = function (e) {

            if (this.readyState == 4 && this.status == 201) {

                // Update the top level celerftworker on the status of the merge all chunks

                //if (chunkmetadata.numberOfUploadedChunks == chunkmetadata.totalNumberOfChunks) {
                    var endtime = new Date();
                    var timetaken = new Date();
                    var timetaken = (((endtime.getTime() - chunkmetadata.starttime.getTime()) / 1000) / 60);
  
                self.postMessage({ 'action': 'updatelegend', 'message': chunkmetadata.filename + " uploaded succesfully. It took " + timetaken.toFixed(2) + " minutes to upload." });
                self.postMessage({ 'action': 'mergecompleted' });
                self.close();

                //}
            }

            // A 400 message indicates that we can't merge all of the files as yet.
            // So queue up the merge request to run in 30 seconds
            if (this.readyState == 4 && this.status == 400) {

                setTimeout(function () { doMergeAll(chunkmetadata, mergeallurl, uploaddirectory); }, 5000);
            }


            if (this.readyState == 4 && this.status == 503) {

                setTimeout(function () { doMergeAll(chunkmetadata, mergeallurl, uploaddirectory); }, 5000);
            }
        };

        // Send the request to merge the file
        xhr.open('GET', mergeallurl + '/?filename=' + chunkmetadata.filename + '&directoryname=' + uploaddirectory + '&numberOfChunks=' + chunkmetadata.totalNumberOfChunks, false);
        xhr.send(null);
        xhr = null;

    }


})();